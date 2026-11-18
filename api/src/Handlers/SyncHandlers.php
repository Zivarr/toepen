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
