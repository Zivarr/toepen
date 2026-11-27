<?php
declare(strict_types=1);

/** Admin: users, memberships, merges, the bin and the full export. */
final class AdminHandlers
{
    public static function invalid(string $reason): ApiError
    {
        return new ApiError(422, 'validation_failed', 'Ongeldige invoer: ' . $reason);
    }

    public static function body(Request $req): array
    {
        if (!is_array($req->json)) {
            throw self::invalid('geen geldige gegevens.');
        }
        return $req->json;
    }

    /** Runs $fn inside one transaction, rolling back on any exception. */
    public static function atomic(PDO $pdo, callable $fn): mixed
    {
        $pdo->beginTransaction();
        try {
            $result = $fn();
            $pdo->commit();
            return $result;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    // ---- users -------------------------------------------------------------------------------

    private static function userNotFound(): ApiError
    {
        return new ApiError(404, 'user_not_found', 'Gebruiker niet gevonden.');
    }

    private static function groupNotFound(): ApiError
    {
        return new ApiError(404, 'group_not_found', 'Groep niet gevonden.');
    }

    private static function playerNotFound(): ApiError
    {
        return new ApiError(404, 'player_not_found', 'Speler niet gevonden.');
    }

    private static function userShape(PDO $pdo, int $id): array
    {
        $st = $pdo->prepare(
            'SELECT u.id, u.username, u.is_admin, u.disabled_at, (u.password_hash IS NULL) AS invite_pending,
                    MAX(t.last_used_at) AS last_used_at
             FROM users u LEFT JOIN auth_tokens t ON t.user_id = u.id
             WHERE u.id = ? GROUP BY u.id, u.username, u.is_admin, u.disabled_at, u.password_hash'
        );
        $st->execute([$id]);
        $u = $st->fetch();
        if (!$u) {
            throw self::userNotFound();
        }
        return [
            'id' => (int)$u['id'],
            'username' => $u['username'],
            'is_admin' => (bool)$u['is_admin'],
            'disabled' => $u['disabled_at'] !== null,
            'invite_pending' => (bool)$u['invite_pending'],
            'last_used_at' => $u['last_used_at'] === null ? null : Groups::iso($u['last_used_at']),
        ];
    }

    /** GET /admin/users */
    public static function listUsers(Request $req, Ctx $ctx, array $params): Response
    {
        $ids = $ctx->pdo->query('SELECT id FROM users ORDER BY username')->fetchAll(PDO::FETCH_COLUMN);
        return new Response(200, ['users' => array_map(fn($id) => self::userShape($ctx->pdo, (int)$id), $ids)]);
    }

    /** POST /admin/users */
    public static function createUser(Request $req, Ctx $ctx, array $params): Response
    {
        $b = self::body($req);
        $username = is_string($b['username'] ?? null) ? trim($b['username']) : '';
        if (!preg_match('/^[A-Za-z0-9._-]{3,30}$/D', $username)) {
            throw self::invalid('gebruikersnaam moet 3 tot 30 tekens zijn (letters, cijfers, punt, streepje, underscore).');
        }
        $password = $b['password'] ?? null;
        if ($password === '') {
            $password = null; // empty form field: invite link instead of a password
        }
        if ($password !== null && (!is_string($password) || mb_strlen($password, 'UTF-8') < 8)) {
            throw self::invalid('wachtwoord moet minimaal 8 tekens zijn.');
        }
        $isAdmin = $b['is_admin'] ?? false;
        if (!is_bool($isAdmin)) {
            throw self::invalid('is_admin moet true of false zijn.');
        }
        $taken = new ApiError(409, 'username_taken', 'Deze gebruikersnaam bestaat al.');
        $st = $ctx->pdo->prepare('SELECT 1 FROM users WHERE username = ?');
        $st->execute([$username]);
        if ($st->fetchColumn() !== false) {
            throw $taken;
        }
        try {
            [$id, $link] = self::atomic($ctx->pdo, function () use ($ctx, $username, $password, $isAdmin) {
                $ctx->pdo->prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')->execute([
                    $username,
                    $password === null ? null : password_hash($password, PASSWORD_DEFAULT),
                    $isAdmin ? 1 : 0,
                ]);
                $id = (int)$ctx->pdo->lastInsertId();
                return [$id, $password === null ? PasswordLinks::create($ctx->pdo, $id, 'invite') : null];
            });
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw $taken;
            }
            throw $e;
        }
        $body = ['user' => self::userShape($ctx->pdo, $id)];
        if ($link !== null) {
            $body['link'] = $link;
        }
        return new Response(201, $body);
    }

    /** POST /admin/users/{id}/password-link: invite link if the user has no password yet, else reset link. */
    public static function passwordLink(Request $req, Ctx $ctx, array $params): Response
    {
        $id = (int)$params['id'];
        $st = $ctx->pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) {
            throw self::userNotFound();
        }
        $purpose = $row['password_hash'] === null ? 'invite' : 'reset';
        $link = self::atomic($ctx->pdo, fn() => PasswordLinks::create($ctx->pdo, $id, $purpose));
        return new Response(201, ['link' => $link]);
    }

    /** PATCH /admin/users/{id}: any of password, disabled, is_admin. */
    public static function patchUser(Request $req, Ctx $ctx, array $params): Response
    {
        $pdo = $ctx->pdo;
        $id = (int)$params['id'];
        $b = self::body($req);
        $st = $pdo->prepare('SELECT 1 FROM users WHERE id = ?');
        $st->execute([$id]);
        if ($st->fetchColumn() === false) {
            throw self::userNotFound();
        }
        $self = $id === (int)$ctx->user['id'];

        $sets = [];
        $args = [];
        if (array_key_exists('password', $b)) {
            if (!is_string($b['password']) || mb_strlen($b['password'], 'UTF-8') < 8) {
                throw self::invalid('wachtwoord moet minimaal 8 tekens zijn.');
            }
            $sets[] = 'password_hash = ?';
            $args[] = password_hash($b['password'], PASSWORD_DEFAULT);
            PasswordLinks::invalidateFor($pdo, $id); // open invite/reset links must not outlive a typed password
        }
        if (array_key_exists('disabled', $b)) {
            if (!is_bool($b['disabled'])) {
                throw self::invalid('disabled moet true of false zijn.');
            }
            if ($self && $b['disabled']) {
                throw self::invalid('je kunt jezelf niet uitschakelen.');
            }
            $sets[] = $b['disabled'] ? 'disabled_at = COALESCE(disabled_at, UTC_TIMESTAMP())' : 'disabled_at = NULL';
        }
        if (array_key_exists('is_admin', $b)) {
            if (!is_bool($b['is_admin'])) {
                throw self::invalid('is_admin moet true of false zijn.');
            }
            if ($self && !$b['is_admin']) {
                throw self::invalid('je kunt je eigen beheerdersrechten niet intrekken.');
            }
            $sets[] = 'is_admin = ?';
            $args[] = $b['is_admin'] ? 1 : 0;
        }
        if ($sets === []) {
            throw self::invalid('niets om te wijzigen.');
        }
        $args[] = $id;
        $pdo->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($args);
        return new Response(200, ['user' => self::userShape($pdo, $id)]);
    }

    /** POST /admin/users/{id}/revoke-tokens */
    public static function revokeTokens(Request $req, Ctx $ctx, array $params): Response
    {
        $id = (int)$params['id'];
        $st = $ctx->pdo->prepare('SELECT 1 FROM users WHERE id = ?');
        $st->execute([$id]);
        if ($st->fetchColumn() === false) {
            throw self::userNotFound();
        }
        $ctx->pdo->prepare('UPDATE auth_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL')
            ->execute([$id]);
        return new Response(204);
    }

    // ---- groups and memberships --------------------------------------------------------------

    public static function requireGroup(PDO $pdo, int $id): void
    {
        $st = $pdo->prepare('SELECT 1 FROM game_groups WHERE id = ?');
        $st->execute([$id]);
        if ($st->fetchColumn() === false) {
            throw self::groupNotFound();
        }
    }

    /** GET /admin/groups */
    public static function listGroups(Request $req, Ctx $ctx, array $params): Response
    {
        $pdo = $ctx->pdo;
        $rows = $pdo->query(
            'SELECT g.id, g.name, u.username AS creator,
                    (SELECT COUNT(*) FROM games x WHERE x.group_id = g.id AND x.deleted_at IS NULL) AS game_count
             FROM game_groups g JOIN users u ON u.id = g.created_by ORDER BY g.name, g.id'
        )->fetchAll();
        $members = $pdo->prepare(
            'SELECT u.id, u.username, u.is_admin FROM group_members m JOIN users u ON u.id = m.user_id
             WHERE m.group_id = ? ORDER BY u.username'
        );
        $out = [];
        foreach ($rows as $r) {
            $members->execute([(int)$r['id']]);
            $out[] = Seasons::state($pdo, (int)$r['id']) + [
                'id' => (int)$r['id'],
                'name' => $r['name'],
                'creator' => $r['creator'],
                'members' => array_map(fn(array $m) => [
                    'id' => (int)$m['id'], 'username' => $m['username'], 'is_admin' => (bool)$m['is_admin'],
                ], $members->fetchAll()),
                'game_count' => (int)$r['game_count'],
            ];
        }
        return new Response(200, ['groups' => $out]);
    }

    /** POST /admin/groups/{id}/members (idempotent) */
    public static function addMember(Request $req, Ctx $ctx, array $params): Response
    {
        $pdo = $ctx->pdo;
        $gid = (int)$params['id'];
        self::requireGroup($pdo, $gid);
        $userId = self::body($req)['user_id'] ?? null;
        if (!is_int($userId)) {
            throw self::invalid('user_id ontbreekt.');
        }
        $st = $pdo->prepare('SELECT 1 FROM users WHERE id = ?');
        $st->execute([$userId]);
        if ($st->fetchColumn() === false) {
            throw self::userNotFound();
        }
        $pdo->prepare('INSERT IGNORE INTO group_members (group_id, user_id, added_by) VALUES (?, ?, ?)')
            ->execute([$gid, $userId, (int)$ctx->user['id']]);
        return new Response(204);
    }

    /** DELETE /admin/groups/{id}/members/{user_id} */
    public static function removeMember(Request $req, Ctx $ctx, array $params): Response
    {
        $gid = (int)$params['id'];
        self::requireGroup($ctx->pdo, $gid);
        $st = $ctx->pdo->prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?');
        $st->execute([$gid, (int)$params['user_id']]);
        if ($st->rowCount() === 0) {
            throw self::userNotFound();
        }
        return new Response(204);
    }

    /** POST /admin/groups/{id}/delete-games: soft delete, optionally only games shorter than 60 s. */
    public static function deleteGames(Request $req, Ctx $ctx, array $params): Response
    {
        $gid = (int)$params['id'];
        self::requireGroup($ctx->pdo, $gid);
        $shortOnly = self::body($req)['short_only'] ?? false;
        if (!is_bool($shortOnly)) {
            throw self::invalid('short_only moet true of false zijn.');
        }
        $st = $ctx->pdo->prepare(
            'UPDATE games SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?
             WHERE group_id = ? AND deleted_at IS NULL' . ($shortOnly ? ' AND duration_ms < 60000' : '')
        );
        $st->execute([(int)$ctx->user['id'], $gid]);
        return new Response(200, ['deleted' => $st->rowCount()]);
    }

    // ---- merges ------------------------------------------------------------------------------

    /** Follows merged_into_player_id to the surviving player. */
    private static function finalPlayer(PDO $pdo, int $id): int
    {
        $st = $pdo->prepare('SELECT merged_into_player_id FROM players WHERE id = ?');
        for ($hops = 0; $hops < 50; $hops++) {
            $st->execute([$id]);
            $next = $st->fetchColumn();
            if ($next === false || $next === null) {
                break;
            }
            $id = (int)$next;
        }
        return $id;
    }

    /** Moves all of $source's game rows to $target (callers have checked for conflicts). */
    private static function moveGames(PDO $pdo, int $source, int $target): void
    {
        $pdo->prepare('UPDATE game_players SET player_id = ? WHERE player_id = ?')->execute([$target, $source]);
        $pdo->prepare('UPDATE games SET winner_player_id = ? WHERE winner_player_id = ?')->execute([$target, $source]);
    }

    /** POST /admin/players/merge */
    public static function mergePlayers(Request $req, Ctx $ctx, array $params): Response
    {
        $pdo = $ctx->pdo;
        $b = self::body($req);
        $src = $b['source_player_id'] ?? null;
        $dst = $b['target_player_id'] ?? null;
        if (!is_int($src) || !is_int($dst)) {
            throw self::invalid('source_player_id en target_player_id zijn verplicht.');
        }
        if ($src === $dst) {
            throw self::invalid('kies twee verschillende spelers.');
        }
        self::atomic($pdo, function () use ($pdo, $src, $dst) {
            $st = $pdo->prepare('SELECT id, group_id, merged_into_player_id FROM players WHERE id = ? FOR UPDATE');
            $st->execute([$src]);
            $s = $st->fetch();
            $st->execute([$dst]);
            $t = $st->fetch();
            if (!$s || !$t) {
                throw self::playerNotFound();
            }
            if ((int)$s['group_id'] !== (int)$t['group_id']) {
                throw self::invalid('spelers horen bij verschillende groepen.');
            }
            if ($s['merged_into_player_id'] !== null || $t['merged_into_player_id'] !== null) {
                throw self::invalid('een van de spelers is al samengevoegd.');
            }
            $st = $pdo->prepare(
                'SELECT 1 FROM game_players a JOIN game_players b ON a.game_id = b.game_id
                 WHERE a.player_id = ? AND b.player_id = ? LIMIT 1'
            );
            $st->execute([$src, $dst]);
            if ($st->fetchColumn() !== false) {
                throw new ApiError(422, 'merge_conflict', 'Deze spelers zitten samen in een spel.');
            }
            self::moveGames($pdo, $src, $dst);
            $pdo->prepare('UPDATE players SET merged_into_player_id = ? WHERE id = ?')->execute([$dst, $src]);
            // Flatten chains that pointed at the source.
            $pdo->prepare('UPDATE players SET merged_into_player_id = ? WHERE merged_into_player_id = ? AND id <> ?')
                ->execute([$dst, $src, $src]);
        });
        return new Response(204);
    }

    /** POST /admin/groups/merge */
    public static function mergeGroups(Request $req, Ctx $ctx, array $params): Response
    {
        $pdo = $ctx->pdo;
        $b = self::body($req);
        $src = $b['source_group_id'] ?? null;
        $dst = $b['target_group_id'] ?? null;
        if (!is_int($src) || !is_int($dst)) {
            throw self::invalid('source_group_id en target_group_id zijn verplicht.');
        }
        if ($src === $dst) {
            throw self::invalid('kies twee verschillende groepen.');
        }
        self::atomic($pdo, function () use ($pdo, $src, $dst) {
            self::requireGroup($pdo, $src);
            self::requireGroup($pdo, $dst);

            $byName = $pdo->prepare('SELECT id FROM players WHERE group_id = ? AND name = ?');
            $players = $pdo->prepare('SELECT id, name FROM players WHERE group_id = ? ORDER BY id');
            $players->execute([$src]);
            foreach ($players->fetchAll() as $p) {
                $pid = (int)$p['id'];
                $byName->execute([$dst, $p['name']]);
                $existing = $byName->fetchColumn();
                if ($existing === false) {
                    $pdo->prepare('UPDATE players SET group_id = ? WHERE id = ?')->execute([$dst, $pid]);
                    continue;
                }
                // Same name in the target: fold into the surviving target player. The source row cannot
                // move (unique name per group) and must go so the source group can be deleted.
                $target = self::finalPlayer($pdo, (int)$existing);
                self::moveGames($pdo, $pid, $target);
                $pdo->prepare('UPDATE players SET merged_into_player_id = ? WHERE merged_into_player_id = ?')
                    ->execute([$target, $pid]);
                $pdo->prepare('UPDATE players SET merged_into_player_id = NULL WHERE id = ?')->execute([$pid]);
                $pdo->prepare('DELETE FROM players WHERE id = ?')->execute([$pid]);
            }

            $pdo->prepare('UPDATE games SET group_id = ? WHERE group_id = ?')->execute([$dst, $src]);
            $pdo->prepare('UPDATE sync_requests SET resolved_group_id = ? WHERE resolved_group_id = ?')->execute([$dst, $src]);
            $pdo->prepare(
                'INSERT IGNORE INTO group_members (group_id, user_id, added_by, added_at)
                 SELECT ?, user_id, added_by, added_at FROM group_members WHERE group_id = ?'
            )->execute([$dst, $src]);
            $pdo->prepare('DELETE FROM group_members WHERE group_id = ?')->execute([$src]);
            $pdo->prepare('DELETE FROM seasons WHERE group_id = ?')->execute([$src]);
            $pdo->prepare('DELETE FROM game_groups WHERE id = ?')->execute([$src]);
        });
        return new Response(200, ['group' => Groups::toApi($pdo, $dst)]);
    }

    // ---- bin ---------------------------------------------------------------------------------

    /** GET /admin/games/deleted: newest deleted first. */
    public static function deletedGames(Request $req, Ctx $ctx, array $params): Response
    {
        $rows = $ctx->pdo->query(
            'SELECT g.id, g.deleted_at, u.username AS deleted_by
             FROM games g LEFT JOIN users u ON u.id = g.deleted_by
             WHERE g.deleted_at IS NOT NULL ORDER BY g.deleted_at DESC, g.id'
        )->fetchAll();
        $games = [];
        foreach ($rows as $r) {
            $games[] = Groups::gameById($ctx->pdo, $r['id']) + [
                'deleted_at' => Groups::iso($r['deleted_at']),
                'deleted_by' => $r['deleted_by'],
            ];
        }
        return new Response(200, ['games' => $games]);
    }

    /** POST /admin/games/{id}/restore */
    public static function restoreGame(Request $req, Ctx $ctx, array $params): Response
    {
        $st = $ctx->pdo->prepare(
            'UPDATE games SET deleted_at = NULL, deleted_by = NULL WHERE id = ? AND deleted_at IS NOT NULL'
        );
        $st->execute([strtolower($params['id'])]);
        if ($st->rowCount() === 0) {
            throw new ApiError(404, 'game_not_found', 'Spel niet gevonden.');
        }
        return new Response(204);
    }

    // ---- export ------------------------------------------------------------------------------

    /** GET /admin/export: full dump without password or token hashes. */
    public static function export(Request $req, Ctx $ctx, array $params): Response
    {
        $pdo = $ctx->pdo;
        $all = fn(string $sql) => $pdo->query($sql)->fetchAll();

        $games = $all('SELECT * FROM games ORDER BY started_at, id');
        $gp = [];
        foreach ($all('SELECT * FROM game_players ORDER BY game_id, seat') as $r) {
            $gp[$r['game_id']][] = $r;
        }
        foreach ($games as &$g) {
            $g['players'] = $gp[$g['id']] ?? [];
        }
        unset($g);

        $requests = $all('SELECT * FROM sync_requests ORDER BY id');
        foreach ($requests as &$r) {
            $r['payload'] = json_decode((string)$r['payload'], true);
        }
        unset($r);

        return new Response(200, [
            'users' => $all('SELECT id, username, is_admin, created_at, disabled_at FROM users ORDER BY id'),
            'groups' => $all('SELECT * FROM game_groups ORDER BY id'),
            'group_members' => $all('SELECT * FROM group_members ORDER BY group_id, user_id'),
            'players' => $all('SELECT * FROM players ORDER BY id'),
            'games' => $games,
            'sync_requests' => $requests,
        ]);
    }
}
