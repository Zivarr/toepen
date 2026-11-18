<?php
declare(strict_types=1);

/** Sync requests: a user sends the games of a local group for an admin to approve. Admin handlers go here too. */
final class SyncHandlers
{
    private const MAX_GAMES = 5000;

    /** POST /sync-requests: stores the validated games as a pending request. */
    public static function create(Request $req, Ctx $ctx, array $params): Response
    {
        $body = $req->json;
        if (!is_array($body)) {
            throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: geen geldige gegevens.');
        }

        $source = $body['source'] ?? null;
        if ($source !== 'pwa' && $source !== 'android') {
            throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: bron moet pwa of android zijn.');
        }

        $groupName = is_string($body['group_name'] ?? null) ? Names::titleCase($body['group_name']) : '';
        $nameLen = mb_strlen($groupName, 'UTF-8');
        if ($nameLen < 1 || $nameLen > 40) {
            throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: groepsnaam moet 1 tot 40 tekens zijn.');
        }

        $rawGames = $body['games'] ?? null;
        if (!is_array($rawGames) || !array_is_list($rawGames)) {
            throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: spellen ontbreken.');
        }
        if (count($rawGames) > self::MAX_GAMES) {
            throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: maximaal 5000 spellen per verzoek.');
        }

        $games = [];
        $seenIds = [];
        foreach ($rawGames as $g) {
            if (!is_array($g)) {
                throw new ApiError(422, 'validation_failed', 'Ongeldig spel: geen geldige invoer.');
            }
            $game = Validate::gameUpload($g, requireGroupId: false);
            if (isset($seenIds[$game['id']])) {
                throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: dubbel spel-id in deze upload.');
            }
            $seenIds[$game['id']] = true;
            $games[] = $game;
        }

        $payload = json_encode(['games' => $games], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $st = $ctx->pdo->prepare(
            'INSERT INTO sync_requests (requested_by, source, group_name, payload) VALUES (?, ?, ?, ?)'
        );
        $st->execute([(int)$ctx->user['id'], $source, $groupName, $payload]);
        $id = (int)$ctx->pdo->lastInsertId();

        return new Response(201, ['request' => self::shape($ctx->pdo, $id)]);
    }

    /** GET /sync-requests/mine: the caller's own requests, newest first. */
    public static function mine(Request $req, Ctx $ctx, array $params): Response
    {
        $st = $ctx->pdo->prepare(
            'SELECT id FROM sync_requests WHERE requested_by = ? ORDER BY created_at DESC, id DESC'
        );
        $st->execute([(int)$ctx->user['id']]);
        $requests = array_map(
            fn(array $r) => self::shape($ctx->pdo, (int)$r['id']),
            $st->fetchAll()
        );
        return new Response(200, ['requests' => $requests]);
    }

    private static function notFound(): ApiError
    {
        return new ApiError(404, 'request_not_found', 'Verzoek niet gevonden.');
    }

    private static function alreadyResolved(): ApiError
    {
        return new ApiError(409, 'already_resolved', 'Dit verzoek is al afgehandeld.');
    }

    /** @return array<int,array> the validated games stored in a request's payload */
    private static function games(string $payload): array
    {
        $data = json_decode($payload, true, 512, JSON_THROW_ON_ERROR);
        return is_array($data['games'] ?? null) ? $data['games'] : [];
    }

    /** @return string[] distinct player names (case-insensitive, first spelling wins) in order of appearance */
    private static function distinctNames(array $games): array
    {
        $seen = [];
        foreach ($games as $g) {
            foreach ($g['players'] as $p) {
                $seen[Names::normalise($p['name'])] ??= $p['name'];
            }
        }
        return array_values($seen);
    }

    /** GET /admin/sync-requests: all requests, pending first, with requester, game count and player names. */
    public static function adminList(Request $req, Ctx $ctx, array $params): Response
    {
        $rows = $ctx->pdo->query(
            "SELECT s.id, s.payload, u.username AS requested_by
             FROM sync_requests s JOIN users u ON u.id = s.requested_by
             ORDER BY (s.status = 'pending') DESC, s.created_at DESC, s.id DESC"
        )->fetchAll();
        $out = [];
        foreach ($rows as $r) {
            $games = self::games((string)$r['payload']);
            $out[] = self::shape($ctx->pdo, (int)$r['id']) + [
                'requested_by' => $r['requested_by'],
                'game_count' => count($games),
                'player_names' => self::distinctNames($games),
            ];
        }
        return new Response(200, ['requests' => $out]);
    }

    /** GET /admin/sync-requests/{id}/matching?group_id=N */
    public static function matching(Request $req, Ctx $ctx, array $params): Response
    {
        $pdo = $ctx->pdo;
        $st = $pdo->prepare('SELECT payload FROM sync_requests WHERE id = ?');
        $st->execute([(int)$params['id']]);
        $payload = $st->fetchColumn();
        if ($payload === false) {
            throw self::notFound();
        }
        $groupId = (int)($req->query['group_id'] ?? 0);
        $st = $pdo->prepare('SELECT 1 FROM game_groups WHERE id = ?');
        $st->execute([$groupId]);
        if ($st->fetchColumn() === false) {
            throw new ApiError(404, 'group_not_found', 'Groep niet gevonden.');
        }

        $st = $pdo->prepare('SELECT id FROM players WHERE group_id = ? AND merged_into_player_id IS NULL ORDER BY name');
        $st->execute([$groupId]);
        $players = array_map(fn(array $r) => Groups::playerShape($pdo, (int)$r['id']), $st->fetchAll());

        $matches = [];
        foreach (self::distinctNames(self::games((string)$payload)) as $name) {
            $matches[] = ['name' => $name] + Names::findMatch($name, $players);
        }
        return new Response(200, ['matches' => $matches]);
    }

    /** POST /admin/sync-requests/{id}/approve: one transaction, request row locked. */
    public static function approve(Request $req, Ctx $ctx, array $params): Response
    {
        $pdo = $ctx->pdo;
        $body = is_array($req->json) ? $req->json : [];
        $mode = $body['mode'] ?? null;
        if ($mode !== 'new' && $mode !== 'link') {
            throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: mode moet new of link zijn.');
        }
        $targetGroup = null;
        $mapping = []; // normalised request name => player id|null
        if ($mode === 'link') {
            $targetGroup = $body['group_id'] ?? null;
            if (!is_int($targetGroup)) {
                throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: group_id ontbreekt.');
            }
            $rawMap = $body['mapping'] ?? [];
            if (!is_array($rawMap)) {
                throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: mapping moet een object zijn.');
            }
            foreach ($rawMap as $name => $pid) {
                if ($pid !== null && !is_int($pid)) {
                    throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: mapping verwijst naar een ongeldige speler.');
                }
                $mapping[Names::normalise((string)$name)] = $pid;
            }
        }

        $requestId = (int)$params['id'];
        $adminId = (int)$ctx->user['id'];
        $pdo->beginTransaction();
        try {
            $st = $pdo->prepare('SELECT requested_by, group_name, payload, status FROM sync_requests WHERE id = ? FOR UPDATE');
            $st->execute([$requestId]);
            $row = $st->fetch();
            if (!$row) {
                throw self::notFound();
            }
            if ($row['status'] !== 'pending') {
                throw self::alreadyResolved();
            }
            $requester = (int)$row['requested_by'];
            $games = self::games((string)$row['payload']);

            // Request name (normalised) => current name of the existing player it maps to.
            $mappedNames = [];
            if ($mode === 'new') {
                $maxPoints = 10;
                $latestStart = '';
                foreach ($games as $g) {
                    if ($g['started_at'] >= $latestStart) {
                        $latestStart = $g['started_at'];
                        $maxPoints = (int)$g['max_penalty_points'];
                    }
                }
                $groupId = Groups::create($pdo, $row['group_name'], $requester, $maxPoints);
            } else {
                $groupId = $targetGroup;
                $st = $pdo->prepare('SELECT 1 FROM game_groups WHERE id = ?');
                $st->execute([$groupId]);
                if ($st->fetchColumn() === false) {
                    throw new ApiError(404, 'group_not_found', 'Groep niet gevonden.');
                }
                $check = $pdo->prepare('SELECT name FROM players WHERE id = ? AND group_id = ? AND merged_into_player_id IS NULL');
                foreach ($mapping as $key => $pid) {
                    if ($pid === null) {
                        continue;
                    }
                    $check->execute([$pid, $groupId]);
                    $name = $check->fetchColumn();
                    if ($name === false) {
                        throw new ApiError(422, 'validation_failed', 'Ongeldige mapping: speler hoort niet bij deze groep.');
                    }
                    $mappedNames[$key] = (string)$name;
                }
                $pdo->prepare('INSERT IGNORE INTO group_members (group_id, user_id, added_by) VALUES (?, ?, ?)')
                    ->execute([$groupId, $requester, $adminId]);
            }

            foreach ($games as $g) {
                $winnerKey = $g['winner'] === null ? null : Names::normalise($g['winner']);
                foreach ($g['players'] as $i => $p) {
                    $key = Names::normalise($p['name']);
                    if (isset($mappedNames[$key])) {
                        $g['players'][$i]['name'] = $mappedNames[$key];
                        if ($winnerKey === $key) {
                            $g['winner'] = $mappedNames[$key];
                        }
                    }
                }
                Groups::insertGame($pdo, $groupId, $requester, $g);
            }

            $pdo->prepare(
                "UPDATE sync_requests SET status = 'approved', resolved_group_id = ?, resolved_by = ?, resolved_at = UTC_TIMESTAMP() WHERE id = ?"
            )->execute([$groupId, $adminId, $requestId]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        return new Response(200, ['request' => self::shape($pdo, $requestId)]);
    }

    /** POST /admin/sync-requests/{id}/reject */
    public static function reject(Request $req, Ctx $ctx, array $params): Response
    {
        $pdo = $ctx->pdo;
        $reason = is_array($req->json) && is_string($req->json['reason'] ?? null) ? trim($req->json['reason']) : '';
        $len = mb_strlen($reason, 'UTF-8');
        if ($len < 1 || $len > 200) {
            throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: reden moet 1 tot 200 tekens zijn.');
        }
        $requestId = (int)$params['id'];
        $pdo->beginTransaction();
        try {
            $st = $pdo->prepare('SELECT status FROM sync_requests WHERE id = ? FOR UPDATE');
            $st->execute([$requestId]);
            $status = $st->fetchColumn();
            if ($status === false) {
                throw self::notFound();
            }
            if ($status !== 'pending') {
                throw self::alreadyResolved();
            }
            $pdo->prepare(
                "UPDATE sync_requests SET status = 'rejected', reject_reason = ?, resolved_by = ?, resolved_at = UTC_TIMESTAMP() WHERE id = ?"
            )->execute([$reason, (int)$ctx->user['id'], $requestId]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        return new Response(200, ['request' => self::shape($pdo, $requestId)]);
    }

    /** The SyncRequest shape from the API contract. */
    private static function shape(PDO $pdo, int $id): array
    {
        $st = $pdo->prepare(
            'SELECT id, group_name, source, status, resolved_group_id, reject_reason, created_at
             FROM sync_requests WHERE id = ?'
        );
        $st->execute([$id]);
        $r = $st->fetch();
        return [
            'id' => (int)$r['id'],
            'group_name' => $r['group_name'],
            'source' => $r['source'],
            'status' => $r['status'],
            'resolved_group_id' => $r['resolved_group_id'] === null ? null : (int)$r['resolved_group_id'],
            'reject_reason' => $r['reject_reason'],
            'created_at' => Groups::iso($r['created_at']),
        ];
    }
}
