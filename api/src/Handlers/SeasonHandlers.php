<?php
declare(strict_types=1);

/** Admin: start, rename, move and delete the seasons of a group. Every call returns the group's season state. */
final class SeasonHandlers
{
    private static function groupId(array $params): int
    {
        return (int)$params['id'];
    }

    /** @return array{id:int,group_id:int} */
    private static function season(PDO $pdo, int $id): array
    {
        $st = $pdo->prepare('SELECT id, group_id FROM seasons WHERE id = ?');
        $st->execute([$id]);
        $r = $st->fetch();
        if (!$r) {
            throw new ApiError(404, 'season_not_found', 'Seizoen niet gevonden.');
        }
        return ['id' => (int)$r['id'], 'group_id' => (int)$r['group_id']];
    }

    /** POST /admin/groups/{id}/seasons */
    public static function start(Request $req, Ctx $ctx, array $params): Response
    {
        $pdo = $ctx->pdo;
        $gid = self::groupId($params);
        AdminHandlers::requireGroup($pdo, $gid);
        $b = AdminHandlers::body($req);
        $name = Seasons::cleanName($b['name'] ?? null);
        $startsAt = ($b['starts_at'] ?? null) === null ? Seasons::nowUtc() : Seasons::cleanStart($b['starts_at']);
        AdminHandlers::atomic($pdo, function () use ($pdo, $gid, $name, $startsAt) {
            Seasons::lockGroup($pdo, $gid);
            Seasons::add($pdo, $gid, $name, $startsAt);
        });
        return new Response(201, Seasons::state($pdo, $gid));
    }

    /** PATCH /admin/seasons/{id}: name and/or starts_at; absent keys stay as they are. */
    public static function patch(Request $req, Ctx $ctx, array $params): Response
    {
        $pdo = $ctx->pdo;
        $s = self::season($pdo, (int)$params['id']);
        $b = AdminHandlers::body($req);
        $hasName = array_key_exists('name', $b);
        $name = $hasName ? Seasons::cleanName($b['name']) : null;
        $startsAt = array_key_exists('starts_at', $b) ? Seasons::cleanStart($b['starts_at']) : null;
        AdminHandlers::atomic($pdo, function () use ($pdo, $s, $hasName, $name, $startsAt) {
            Seasons::lockGroup($pdo, $s['group_id']);
            if ($startsAt !== null) {
                Seasons::moveStart($pdo, $s['id'], $s['group_id'], $startsAt);
            }
            if ($hasName) {
                $pdo->prepare('UPDATE seasons SET name = ? WHERE id = ?')->execute([$name, $s['id']]);
            }
        });
        return new Response(200, Seasons::state($pdo, $s['group_id']));
    }

    /** DELETE /admin/seasons/{id} */
    public static function delete(Request $req, Ctx $ctx, array $params): Response
    {
        $pdo = $ctx->pdo;
        $s = self::season($pdo, (int)$params['id']);
        $pdo->prepare('DELETE FROM seasons WHERE id = ?')->execute([$s['id']]);
        return new Response(200, Seasons::state($pdo, $s['group_id']));
    }

    /** PATCH /admin/groups/{id}/first-season */
    public static function renameFirst(Request $req, Ctx $ctx, array $params): Response
    {
        $pdo = $ctx->pdo;
        $gid = self::groupId($params);
        AdminHandlers::requireGroup($pdo, $gid);
        $b = AdminHandlers::body($req);
        $name = Seasons::cleanName($b['name'] ?? null);
        $pdo->prepare('UPDATE game_groups SET first_season_name = ? WHERE id = ?')->execute([$name, $gid]);
        return new Response(200, Seasons::state($pdo, $gid));
    }
}
