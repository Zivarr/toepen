<?php
declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

final class SyncRequestTest extends TestCase
{
    private const UUID = '3f2b8c1e-5d4a-4e7b-9a10-1c2d3e4f5a6b';
    private const UUID2 = '4a3c9d2f-6e5b-4f8c-8b21-2d3e4f5a6b7c';

    /** GameUpload without group_id, as sent in a sync request. */
    private function game(string $id = self::UUID, array $over = []): array
    {
        return array_merge([
            'id' => $id,
            'started_at' => '2026-11-18T21:04:05+01:00',
            'duration_ms' => 600000,
            'max_penalty_points' => 15,
            'ended_early' => false,
            'winner' => 'Ravi',
            'players' => [
                ['name' => 'tim', 'final_score' => 15, 'boer_count' => 2],
                ['name' => 'Ravi', 'final_score' => 7, 'boer_count' => 0],
            ],
        ], $over);
    }

    private function request(array $over = []): array
    {
        return array_merge([
            'source' => 'pwa',
            'group_name' => 'vrienden',
            'games' => [$this->game()],
        ], $over);
    }

    private function countSyncRequests(): int
    {
        return (int)$this->pdo()->query('SELECT COUNT(*) FROM sync_requests')->fetchColumn();
    }

    public function test_create_request_is_pending_and_listed_in_mine(): void
    {
        $tim = $this->makeUser('tim');

        $r = $this->call('POST', '/sync-requests', $this->request(), $tim['token']);
        $this->assertSame(201, $r->status);
        $req = $r->body['request'];
        $this->assertSame('Vrienden', $req['group_name']);
        $this->assertSame('pwa', $req['source']);
        $this->assertSame('pending', $req['status']);
        $this->assertNull($req['resolved_group_id']);
        $this->assertNull($req['reject_reason']);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/', $req['created_at']);

        $mine = $this->call('GET', '/sync-requests/mine', null, $tim['token']);
        $this->assertSame(200, $mine->status);
        $this->assertCount(1, $mine->body['requests']);
        $this->assertSame($req['id'], $mine->body['requests'][0]['id']);
        $this->assertSame('pending', $mine->body['requests'][0]['status']);

        $payload = json_decode((string)$this->pdo()->query('SELECT payload FROM sync_requests')->fetchColumn(), true);
        $this->assertSame(self::UUID, $payload['games'][0]['id']);
        $this->assertSame('Tim', $payload['games'][0]['players'][0]['name']);
        $this->assertNull($payload['games'][0]['group_id']);
    }

    public function test_request_with_invalid_game_is_422_and_nothing_stored(): void
    {
        $tim = $this->makeUser('tim');
        $bad = $this->request(['games' => [$this->game(), $this->game(self::UUID2, ['winner' => 'Niemand'])]]);

        $r = $this->call('POST', '/sync-requests', $bad, $tim['token']);
        $this->assertSame(422, $r->status);
        $this->assertSame('validation_failed', $r->body['error']);
        $this->assertSame(0, $this->countSyncRequests());
    }

    public function test_invalid_game_422_identifies_the_game(): void
    {
        $tim = $this->makeUser('tim');
        $bad = $this->request(['games' => [$this->game(), $this->game(self::UUID2, ['winner' => 'Niemand'])]]);
        $r = $this->call('POST', '/sync-requests', $bad, $tim['token']);
        $this->assertSame(422, $r->status);
        $this->assertSame(1, $r->body['game_index']);
        $this->assertSame(self::UUID2, $r->body['game_id']);

        $bad = $this->request(['games' => [$this->game('kapot')]]);
        $r = $this->call('POST', '/sync-requests', $bad, $tim['token']);
        $this->assertSame(0, $r->body['game_index']);
        $this->assertSame('kapot', $r->body['game_id']);
    }

    public function test_request_with_zero_games_is_allowed(): void
    {
        $tim = $this->makeUser('tim');

        $r = $this->call('POST', '/sync-requests', $this->request(['games' => []]), $tim['token']);
        $this->assertSame(201, $r->status);
        $this->assertSame('pending', $r->body['request']['status']);
    }

    public function test_mine_only_shows_own_requests(): void
    {
        $tim = $this->makeUser('tim');
        $ravi = $this->makeUser('ravi');
        $this->call('POST', '/sync-requests', $this->request(), $tim['token']);
        $this->call('POST', '/sync-requests', $this->request(['group_name' => 'Werk']), $ravi['token']);

        $mine = $this->call('GET', '/sync-requests/mine', null, $tim['token']);
        $this->assertSame(200, $mine->status);
        $this->assertCount(1, $mine->body['requests']);
        $this->assertSame('Vrienden', $mine->body['requests'][0]['group_name']);
    }

    public function test_mine_is_newest_first(): void
    {
        $tim = $this->makeUser('tim');
        $this->call('POST', '/sync-requests', $this->request(['group_name' => 'Eerste']), $tim['token']);
        $this->call('POST', '/sync-requests', $this->request(['group_name' => 'Tweede']), $tim['token']);

        $names = array_column($this->call('GET', '/sync-requests/mine', null, $tim['token'])->body['requests'], 'group_name');
        $this->assertSame(['Tweede', 'Eerste'], $names);
    }

    public function test_invalid_source_is_422(): void
    {
        $tim = $this->makeUser('tim');

        $r = $this->call('POST', '/sync-requests', $this->request(['source' => 'ios']), $tim['token']);
        $this->assertSame(422, $r->status);
        $this->assertStringStartsWith('Ongeldige invoer:', $r->body['message']);
        $this->assertSame(0, $this->countSyncRequests());
    }

    public function test_empty_group_name_is_422(): void
    {
        $tim = $this->makeUser('tim');

        $r = $this->call('POST', '/sync-requests', $this->request(['group_name' => '   ']), $tim['token']);
        $this->assertSame(422, $r->status);
        $this->assertStringStartsWith('Ongeldige invoer:', $r->body['message']);
    }

    public function test_duplicate_game_ids_in_one_request_are_422(): void
    {
        $tim = $this->makeUser('tim');

        $r = $this->call('POST', '/sync-requests', $this->request(['games' => [$this->game(), $this->game()]]), $tim['token']);
        $this->assertSame(422, $r->status);
        $this->assertSame(0, $this->countSyncRequests());
    }

    public function test_more_than_5000_games_is_422(): void
    {
        $tim = $this->makeUser('tim');

        $r = $this->call('POST', '/sync-requests', $this->request(['games' => array_fill(0, 5001, [])]), $tim['token']);
        $this->assertSame(422, $r->status);
        $this->assertSame(0, $this->countSyncRequests());
    }

    public function test_sync_requests_require_login(): void
    {
        $this->assertSame(401, $this->call('POST', '/sync-requests', $this->request())->status);
        $this->assertSame(401, $this->call('GET', '/sync-requests/mine')->status);
    }
}
