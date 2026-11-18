<?php
declare(strict_types=1);

final class GroupHandlers
{
    public static function list(Request $req, Ctx $ctx, array $params): Response
    {
        $st = $ctx->pdo->prepare(
            'SELECT g.id FROM game_groups g JOIN group_members m ON m.group_id = g.id
             WHERE m.user_id = ? ORDER BY g.id'
        );
        $st->execute([$ctx->user['id']]);
        $groups = array_map(
            fn($id) => Groups::toApi($ctx->pdo, (int)$id),
            $st->fetchAll(PDO::FETCH_COLUMN)
        );
        $body = ['groups' => $groups];
        $etag = '"' . sha1((string)json_encode($body)) . '"';
        if ($req->header('If-None-Match') === $etag) {
            return new Response(304, null, ['ETag' => $etag]);
        }
        return new Response(200, $body, ['ETag' => $etag]);
    }

    public static function patch(Request $req, Ctx $ctx, array $params): Response
    {
        $id = (int)$params['id'];
        Groups::requireMember($ctx, $id);
        $max = ($req->json ?? [])['max_penalty_points'] ?? null;
        if (!is_int($max) || $max < 1 || $max > 100) {
            throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: max_penalty_points moet een getal van 1 tot 100 zijn.');
        }
        $ctx->pdo->prepare('UPDATE game_groups SET max_penalty_points = ? WHERE id = ?')->execute([$max, $id]);
        return new Response(200, ['group' => Groups::toApi($ctx->pdo, $id)]);
    }

    public static function addPlayer(Request $req, Ctx $ctx, array $params): Response
    {
        $body = $req->json ?? [];
        $groupId = $body['group_id'] ?? null;
        if (!is_int($groupId)) {
            throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: group_id ontbreekt.');
        }
        Groups::requireMember($ctx, $groupId);
        $name = Names::titleCase(is_string($body['name'] ?? null) ? $body['name'] : '');
        $len = mb_strlen($name, 'UTF-8');
        if ($len < 1 || $len > 40) {
            throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: naam moet 1 tot 40 tekens zijn.');
        }
        $pid = self::createPlayer($ctx->pdo, $groupId, $name);
        return new Response(201, ['player' => Groups::playerShape($ctx->pdo, $pid)]);
    }

    /**
     * Creates the player or throws 409 name_taken carrying the live player (end of the merge chain).
     * A concurrent insert that loses on the unique key is reported the same way.
     */
    public static function createPlayer(PDO $pdo, int $groupId, string $name): int
    {
        $conflict = fn() => new ApiError(409, 'name_taken', 'Deze speler bestaat al.', [
            'player' => Groups::playerShape($pdo, Groups::resolvePlayer($pdo, $groupId, $name)),
        ]);
        if (Groups::findPlayerByName($pdo, $groupId, $name) !== null) {
            throw $conflict();
        }
        try {
            return Groups::resolvePlayer($pdo, $groupId, $name);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? null) === 1062) {
                throw $conflict();
            }
            throw $e;
        }
    }
}
