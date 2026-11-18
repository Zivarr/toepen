<?php
declare(strict_types=1);

/** Group / player read and write helpers, shared by the group, game, sync and admin handlers. */
final class Groups
{
    public static function isMember(PDO $pdo, int $groupId, int $userId): bool
    {
        $st = $pdo->prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?');
        $st->execute([$groupId, $userId]);
        return $st->fetchColumn() !== false;
    }

    /** @return array The game_groups row. Admins pass without membership. */
    public static function requireMember(Ctx $ctx, int $groupId): array
    {
        $st = $ctx->pdo->prepare('SELECT * FROM game_groups WHERE id = ?');
        $st->execute([$groupId]);
        $group = $st->fetch();
        if (!$group) {
            throw new ApiError(404, 'group_not_found', 'Groep niet gevonden.');
        }
        $user = $ctx->user;
        if ($user === null || (!$user['is_admin'] && !self::isMember($ctx->pdo, $groupId, (int)$user['id']))) {
            throw new ApiError(403, 'not_member', 'Je bent geen lid van deze groep.');
        }
        return $group;
    }

    public static function create(PDO $pdo, string $name, int $createdBy, int $maxPenaltyPoints): int
    {
        $pdo->prepare('INSERT INTO game_groups (name, created_by, max_penalty_points) VALUES (?, ?, ?)')
            ->execute([$name, $createdBy, $maxPenaltyPoints]);
        $id = (int)$pdo->lastInsertId();
        $pdo->prepare('INSERT INTO group_members (group_id, user_id, added_by) VALUES (?, ?, ?)')
            ->execute([$id, $createdBy, $createdBy]);
        return $id;
    }

    /** Case-insensitive lookup following merge chains; creates the player when absent. */
    public static function resolvePlayer(PDO $pdo, int $groupId, string $name): int
    {
        $clean = Names::titleCase($name);
        $st = $pdo->prepare('SELECT id, merged_into_player_id FROM players WHERE group_id = ? AND name = ?');
        $st->execute([$groupId, $clean]);
        $row = $st->fetch();
        if (!$row) {
            $pdo->prepare('INSERT INTO players (group_id, name) VALUES (?, ?)')->execute([$groupId, $clean]);
            return (int)$pdo->lastInsertId();
        }
        $id = (int)$row['id'];
        $next = $row['merged_into_player_id'];
        $hops = 0;
        $follow = $pdo->prepare('SELECT id, merged_into_player_id FROM players WHERE id = ?');
        while ($next !== null && $hops++ < 50) {
            $follow->execute([(int)$next]);
            $r = $follow->fetch();
            if (!$r) {
                break;
            }
            $id = (int)$r['id'];
            $next = $r['merged_into_player_id'];
        }
        return $id;
    }

    /** Looks up an unmerged-or-not player by name without creating it. */
    public static function findPlayerByName(PDO $pdo, int $groupId, string $name): ?array
    {
        $st = $pdo->prepare(
            'SELECT p.id, p.name, (SELECT COUNT(*) FROM game_players gp JOIN games g ON g.id = gp.game_id
                                   WHERE gp.player_id = p.id AND g.deleted_at IS NULL) AS games_played
             FROM players p WHERE p.group_id = ? AND p.name = ?'
        );
        $st->execute([$groupId, Names::titleCase($name)]);
        $r = $st->fetch();
        return $r ? ['id' => (int)$r['id'], 'name' => $r['name'], 'games_played' => (int)$r['games_played']] : null;
    }

    public static function playerShape(PDO $pdo, int $playerId): array
    {
        $st = $pdo->prepare(
            'SELECT p.id, p.name, (SELECT COUNT(*) FROM game_players gp JOIN games g ON g.id = gp.game_id
                                   WHERE gp.player_id = p.id AND g.deleted_at IS NULL) AS games_played
             FROM players p WHERE p.id = ?'
        );
        $st->execute([$playerId]);
        $r = $st->fetch();
        return ['id' => (int)$r['id'], 'name' => $r['name'], 'games_played' => (int)$r['games_played']];
    }

    public static function toApi(PDO $pdo, int $groupId): array
    {
        $st = $pdo->prepare(
            'SELECT g.id, g.name, g.max_penalty_points, u.username AS creator
             FROM game_groups g JOIN users u ON u.id = g.created_by WHERE g.id = ?'
        );
        $st->execute([$groupId]);
        $g = $st->fetch();
        if (!$g) {
            throw new ApiError(404, 'group_not_found', 'Groep niet gevonden.');
        }

        $st = $pdo->prepare(
            'SELECT p.id, p.name, COUNT(g.id) AS games_played
             FROM players p
             LEFT JOIN game_players gp ON gp.player_id = p.id
             LEFT JOIN games g ON g.id = gp.game_id AND g.deleted_at IS NULL
             WHERE p.group_id = ? AND p.merged_into_player_id IS NULL
             GROUP BY p.id, p.name
             ORDER BY games_played DESC, p.name ASC'
        );
        $st->execute([$groupId]);
        $players = array_map(
            fn(array $r) => ['id' => (int)$r['id'], 'name' => $r['name'], 'games_played' => (int)$r['games_played']],
            $st->fetchAll()
        );

        return [
            'id' => (int)$g['id'],
            'name' => $g['name'],
            'creator' => $g['creator'],
            'max_penalty_points' => (int)$g['max_penalty_points'],
            'players' => $players,
            'games' => self::gamesFor($pdo, $groupId),
        ];
    }

    /** Non-deleted games of a group, newest first, in the Game shape. */
    public static function gamesFor(PDO $pdo, int $groupId): array
    {
        return self::loadGames($pdo, 'g.group_id = ? AND g.deleted_at IS NULL', [$groupId]);
    }

    /** One game in the Game shape, deleted or not; null when the UUID is unknown. */
    public static function gameById(PDO $pdo, string $id): ?array
    {
        return self::loadGames($pdo, 'g.id = ?', [$id])[0] ?? null;
    }

    /** @param array<int,mixed> $args */
    private static function loadGames(PDO $pdo, string $where, array $args): array
    {
        $st = $pdo->prepare(
            'SELECT g.id, g.group_id, g.started_at, g.duration_ms, g.max_penalty_points, g.ended_early,
                    u.username AS recorded_by, w.name AS winner
             FROM games g
             JOIN users u ON u.id = g.recorded_by
             LEFT JOIN players w ON w.id = g.winner_player_id
             WHERE ' . $where . '
             ORDER BY g.started_at DESC, g.received_at DESC, g.id'
        );
        $st->execute($args);
        $rows = $st->fetchAll();
        if ($rows === []) {
            return [];
        }

        $st = $pdo->prepare(
            'SELECT gp.game_id, p.name, gp.final_score, gp.boer_count
             FROM game_players gp
             JOIN players p ON p.id = gp.player_id
             JOIN games g ON g.id = gp.game_id
             WHERE ' . $where . '
             ORDER BY gp.game_id, gp.seat'
        );
        $st->execute($args);
        $byGame = [];
        foreach ($st->fetchAll() as $r) {
            $byGame[$r['game_id']][] = [
                'name' => $r['name'],
                'final_score' => (int)$r['final_score'],
                'boer_count' => (int)$r['boer_count'],
            ];
        }

        return array_map(fn(array $r) => [
            'id' => $r['id'],
            'group_id' => (int)$r['group_id'],
            'recorded_by' => $r['recorded_by'],
            'started_at' => self::iso($r['started_at']),
            'duration_ms' => (int)$r['duration_ms'],
            'max_penalty_points' => (int)$r['max_penalty_points'],
            'ended_early' => (bool)$r['ended_early'],
            'winner' => $r['winner'],
            'players' => $byGame[$r['id']] ?? [],
        ], $rows);
    }

    /**
     * Inserts a validated game (see Validate::gameUpload) with its players, atomically.
     * Returns false, changing nothing, when the UUID already exists.
     */
    public static function insertGame(PDO $pdo, int $groupId, int $recordedBy, array $game): bool
    {
        // Join an outer transaction when there is one (sync approval); only own begin/commit/rollback otherwise.
        $own = !$pdo->inTransaction();
        if ($own) {
            $pdo->beginTransaction();
        }
        try {
            $ins = $pdo->prepare(
                'INSERT IGNORE INTO games (id, group_id, recorded_by, started_at, received_at, duration_ms,
                                           max_penalty_points, ended_early)
                 VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), ?, ?, ?)'
            );
            $ins->execute([
                $game['id'], $groupId, $recordedBy, $game['started_at'], $game['duration_ms'],
                $game['max_penalty_points'], $game['ended_early'] ? 1 : 0,
            ]);
            if ($ins->rowCount() === 0) {
                if ($own) {
                    $pdo->rollBack();
                }
                return false;
            }

            $ids = [];
            $addPlayer = $pdo->prepare(
                'INSERT INTO game_players (game_id, player_id, seat, final_score, boer_count) VALUES (?, ?, ?, ?, ?)'
            );
            foreach ($game['players'] as $seat => $p) {
                $pid = self::resolvePlayer($pdo, $groupId, $p['name']);
                if (isset($ids[$pid])) {
                    throw new ApiError(422, 'validation_failed', 'Ongeldig spel: twee spelers verwijzen naar dezelfde speler.');
                }
                $ids[$pid] = true;
                $addPlayer->execute([$game['id'], $pid, $seat, $p['final_score'], $p['boer_count']]);
                if ($game['winner'] !== null && Names::normalise($game['winner']) === Names::normalise($p['name'])) {
                    $winnerId = $pid;
                }
            }
            if (isset($winnerId)) {
                $pdo->prepare('UPDATE games SET winner_player_id = ? WHERE id = ?')->execute([$winnerId, $game['id']]);
            }
            if ($own) {
                $pdo->commit();
            }
            return true;
        } catch (Throwable $e) {
            if ($own && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /** DATETIME (stored in UTC) to ISO 8601 with offset. */
    public static function iso(string $dt): string
    {
        return (new DateTimeImmutable($dt, new DateTimeZone('UTC')))->format('Y-m-d\TH:i:sP');
    }
}
