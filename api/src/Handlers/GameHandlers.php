<?php
declare(strict_types=1);

final class GameHandlers
{
    public static function upload(Request $req, Ctx $ctx, array $params): Response
    {
        $body = $req->json;
        if (!is_array($body)) {
            throw new ApiError(422, 'validation_failed', 'Ongeldig spel: geen geldige invoer.');
        }
        $groupId = $body['group_id'] ?? null;
        if (!is_int($groupId)) {
            throw new ApiError(422, 'validation_failed', 'Ongeldig spel: groep ontbreekt.');
        }
        Groups::requireMember($ctx, $groupId);
        $game = Validate::gameUpload($body);

        if (Groups::insertGame($ctx->pdo, $groupId, (int)$ctx->user['id'], $game)) {
            return new Response(201, ['game' => Groups::gameById($ctx->pdo, $game['id'])]);
        }

        // Same UUID already stored: change nothing, return what is stored (never the new body).
        $stored = Groups::gameById($ctx->pdo, $game['id']);
        if ($stored === null) {
            throw new ApiError(409, 'game_conflict', 'Dit spel kon niet worden opgeslagen, probeer het opnieuw.');
        }
        if ($stored['group_id'] !== $groupId) {
            Groups::requireMember($ctx, $stored['group_id']);
        }
        return new Response(200, ['game' => $stored, 'duplicate' => true]);
    }

    public static function delete(Request $req, Ctx $ctx, array $params): Response
    {
        $st = $ctx->pdo->prepare('SELECT group_id, recorded_by FROM games WHERE id = ? AND deleted_at IS NULL');
        $st->execute([strtolower($params['id'])]);
        $row = $st->fetch();
        if (!$row) {
            throw new ApiError(404, 'game_not_found', 'Spel niet gevonden.');
        }
        $isAdmin = (bool)$ctx->user['is_admin'];
        if (!$isAdmin) {
            if (!Groups::isMember($ctx->pdo, (int)$row['group_id'], (int)$ctx->user['id'])
                || (int)$row['recorded_by'] !== (int)$ctx->user['id']) {
                throw new ApiError(403, 'not_allowed', 'Je mag alleen je eigen spellen verwijderen.');
            }
        }
        $upd = $ctx->pdo->prepare(
            'UPDATE games SET deleted_at = UTC_TIMESTAMP(), deleted_by = ? WHERE id = ? AND deleted_at IS NULL'
        );
        $upd->execute([(int)$ctx->user['id'], strtolower($params['id'])]);
        if ($upd->rowCount() === 0) {
            throw new ApiError(404, 'game_not_found', 'Spel niet gevonden.');
        }
        return new Response(204, null);
    }
}
