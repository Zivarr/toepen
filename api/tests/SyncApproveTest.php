<?php
declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

final class SyncApproveTest extends TestCase
{
    private const U1 = '3f2b8c1e-5d4a-4e7b-9a10-1c2d3e4f5a6b';
    private const U2 = '4a3c9d2f-6e5b-4f8c-8b21-2d3e4f5a6b7c';

    private function game(string $id, string $a, string $b, string $start = '2026-11-18T21:04:05+01:00', int $max = 15): array
    {
        return [
            'id' => $id, 'started_at' => $start, 'duration_ms' => 600000, 'max_penalty_points' => $max,
            'ended_early' => false, 'winner' => $b,
            'players' => [
                ['name' => $a, 'final_score' => $max, 'boer_count' => 1],
                ['name' => $b, 'final_score' => 5, 'boer_count' => 0],
            ],
        ];
    }

    /** @return array{0:array,1:array,2:int} requester, admin, request id */
    private function setupRequest(?array $games = null): array
    {
        $tim = $this->makeUser('tim');
        $admin = $this->makeUser('admin', true);
        $games ??= [
            $this->game(self::U1, 'Tim', 'Rav', '2026-11-18T21:00:00+01:00', 12),
            $this->game(self::U2, 'Tim', 'Piet', '2026-11-19T21:00:00+01:00', 20),
        ];
        $r = $this->call('POST', '/sync-requests', ['source' => 'pwa', 'group_name' => 'vrienden', 'games' => $games], $tim['token']);
        $this->assertSame(201, $r->status);
        return [$tim, $admin, $r->body['request']['id']];
    }

    private function rows(string $table): int
    {
        return (int)$this->pdo()->query("SELECT COUNT(*) FROM $table")->fetchColumn();
    }

    private function matching(int $id, int $groupId, array $admin): Response
    {
        return App::handle(
            new Request('GET', "/admin/sync-requests/$id/matching", ['Authorization' => 'Bearer ' . $admin['token']], null, ['group_id' => (string)$groupId]),
            $this->pdo()
        );
    }

    private function existingGroup(array $user): array
    {
        $gid = Groups::create($this->pdo(), 'Bestaand', $user['id'], 10);
        $ravi = Groups::resolvePlayer($this->pdo(), $gid, 'Ravi');
        $kees = Groups::resolvePlayer($this->pdo(), $gid, 'Kees');
        return [$gid, $ravi, $kees];
    }

    public function test_list_requests_pending_first_with_counts_and_names(): void
    {
        [$tim, $admin, $id1] = $this->setupRequest();
        $r2 = $this->call('POST', '/sync-requests', ['source' => 'android', 'group_name' => 'Twee', 'games' => [$this->game('5b4d0e3a-7f6c-4a9d-9c32-3e4f5a6b7c8d', 'A1', 'B1')]], $tim['token']);
        $id2 = $r2->body['request']['id'];
        $this->call('POST', "/admin/sync-requests/$id1/reject", ['reason' => 'nee'], $admin['token']);

        $r = $this->call('GET', '/admin/sync-requests', null, $admin['token']);
        $this->assertSame(200, $r->status);
        $list = $r->body['requests'];
        $this->assertCount(2, $list);
        $this->assertSame($id2, $list[0]['id']);
        $this->assertSame('pending', $list[0]['status']);
        $this->assertSame('tim', $list[0]['requested_by']);
        $this->assertSame(1, $list[0]['game_count']);
        $this->assertSame(['A1', 'B1'], $list[0]['player_names']);
        $this->assertSame($id1, $list[1]['id']);
        $this->assertSame(2, $list[1]['game_count']);
        $this->assertSame(['Tim', 'Rav', 'Piet'], $list[1]['player_names']);
        $this->assertSame('rejected', $list[1]['status']);

        $this->assertSame(403, $this->call('GET', '/admin/sync-requests', null, $tim['token'])->status);
    }

    public function test_matching_against_group(): void
    {
        [$tim, $admin, $id] = $this->setupRequest([
            $this->game(self::U1, 'Ravi', 'Rav'),
            $this->game(self::U2, 'Piet', 'RAVI'),
        ]);
        [$gid, $ravi] = $this->existingGroup($tim);

        $r = $this->matching($id, $gid, $admin);
        $this->assertSame(200, $r->status);
        $m = [];
        foreach ($r->body['matches'] as $row) {
            $m[$row['name']] = $row;
        }
        $this->assertSame(['Ravi', 'Rav', 'Piet'], array_keys($m));
        $this->assertSame('exact', $m['Ravi']['match']);
        $this->assertSame($ravi, $m['Ravi']['player_id']);
        $this->assertSame('similar', $m['Rav']['match']);
        $this->assertNull($m['Rav']['player_id']);
        $this->assertSame('Ravi', $m['Rav']['suggestions'][0]['name']);
        $this->assertSame($ravi, $m['Rav']['suggestions'][0]['id']);
        $this->assertSame('new', $m['Piet']['match']);

        $this->assertSame(404, $this->matching($id, 9999, $admin)->status);
        $this->assertSame(404, $this->matching(9999, $gid, $admin)->status);
    }

    public function test_approve_new_creates_group_with_requester_as_member_and_games(): void
    {
        [$tim, $admin, $id] = $this->setupRequest();

        $r = $this->call('POST', "/admin/sync-requests/$id/approve", ['mode' => 'new'], $admin['token']);
        $this->assertSame(200, $r->status);
        $req = $r->body['request'];
        $this->assertSame('approved', $req['status']);
        $gid = $req['resolved_group_id'];
        $this->assertNotNull($gid);

        $g = $this->pdo()->query("SELECT * FROM game_groups WHERE id = $gid")->fetch();
        $this->assertSame('Vrienden', $g['name']);
        $this->assertSame($tim['id'], (int)$g['created_by']);
        $this->assertSame(20, (int)$g['max_penalty_points']); // most recent game
        $this->assertTrue(Groups::isMember($this->pdo(), $gid, $tim['id']));
        $this->assertSame(2, $this->rows('games'));
        $this->assertSame(2, (int)$this->pdo()->query('SELECT COUNT(*) FROM games WHERE recorded_by = ' . $tim['id'])->fetchColumn());
        $this->assertSame(3, $this->rows('players'));

        $row = $this->pdo()->query("SELECT status, resolved_group_id, resolved_by, resolved_at FROM sync_requests WHERE id = $id")->fetch();
        $this->assertSame($admin['id'], (int)$row['resolved_by']);
        $this->assertNotNull($row['resolved_at']);
    }

    public function test_approve_link_maps_names_and_adds_member(): void
    {
        [$tim, $admin, $id] = $this->setupRequest();
        $other = $this->makeUser('owner');
        [$gid, $ravi] = $this->existingGroup($other);
        $this->assertFalse(Groups::isMember($this->pdo(), $gid, $tim['id']));

        $r = $this->call('POST', "/admin/sync-requests/$id/approve",
            ['mode' => 'link', 'group_id' => $gid, 'mapping' => ['Rav' => $ravi, 'Piet' => null]], $admin['token']);
        $this->assertSame(200, $r->status);
        $this->assertSame($gid, $r->body['request']['resolved_group_id']);
        $this->assertTrue(Groups::isMember($this->pdo(), $gid, $tim['id']));

        $names = $this->pdo()->query("SELECT name FROM players WHERE group_id = $gid ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
        // 'Rav' is the alias row created by the mapping; it is not a live player.
        $this->assertSame(['Kees', 'Piet', 'Rav', 'Ravi', 'Tim'], $names);
        $game = Groups::gameById($this->pdo(), self::U1);
        $this->assertSame($gid, $game['group_id']);
        $this->assertSame(['Tim', 'Ravi'], array_column($game['players'], 'name'));
        $this->assertSame('Ravi', $game['winner']);
    }

    public function test_approve_link_creates_alias_so_later_uploads_follow_mapping(): void
    {
        [$tim, $admin, $id] = $this->setupRequest();
        [$gid, $ravi] = $this->existingGroup($tim);

        $r = $this->call('POST', "/admin/sync-requests/$id/approve",
            ['mode' => 'link', 'group_id' => $gid, 'mapping' => ['Rav' => $ravi, 'Piet' => null]], $admin['token']);
        $this->assertSame(200, $r->status);

        $live = fn() => array_column($this->call('GET', '/groups', null, $tim['token'])->body['groups'][0]['players'], 'name');
        $this->assertNotContains('Rav', $live());

        $up = [
            'id' => '5b4d0e30-7f6c-4a9d-9c32-3e4f5a6b7c8d', 'group_id' => $gid,
            'started_at' => '2026-12-01T20:00:00+01:00', 'duration_ms' => 600000, 'max_penalty_points' => 10,
            'ended_early' => false, 'winner' => 'Rav',
            'players' => [
                ['name' => 'Tim', 'final_score' => 10, 'boer_count' => 0],
                ['name' => 'Rav', 'final_score' => 3, 'boer_count' => 0],
            ],
        ];
        $r = $this->call('POST', '/games', $up, $tim['token']);
        $this->assertSame(201, $r->status);
        $this->assertSame('Ravi', $r->body['game']['winner']);
        $this->assertSame(['Tim', 'Ravi'], array_column($r->body['game']['players'], 'name'));
        $this->assertNotContains('Rav', $live());
    }

    public function test_matching_treats_merged_away_name_as_exact(): void
    {
        [$tim, $admin, $id] = $this->setupRequest([$this->game(self::U1, 'Tim', 'rav')]);
        [$gid, $ravi] = $this->existingGroup($tim);
        $rav = Groups::resolvePlayer($this->pdo(), $gid, 'Rav');
        $ravv = Groups::resolvePlayer($this->pdo(), $gid, 'Ravv');
        $this->pdo()->exec("UPDATE players SET merged_into_player_id = $ravv WHERE id = $rav");
        $this->pdo()->exec("UPDATE players SET merged_into_player_id = $ravi WHERE id = $ravv");

        $m = array_column($this->matching($id, $gid, $admin)->body['matches'], null, 'name');
        $this->assertSame('exact', $m['Rav']['match']);
        $this->assertSame($ravi, $m['Rav']['player_id']);
    }

    public function test_approve_link_skips_games_already_present(): void
    {
        [$tim, $admin, $id] = $this->setupRequest();
        [$gid] = $this->existingGroup($tim);
        Groups::insertGame($this->pdo(), $gid, $tim['id'], $this->game(self::U1, 'Tim', 'Ravi'));
        $this->assertSame(1, $this->rows('games'));

        $r = $this->call('POST', "/admin/sync-requests/$id/approve", ['mode' => 'link', 'group_id' => $gid, 'mapping' => []], $admin['token']);
        $this->assertSame(200, $r->status);
        $this->assertSame(2, $this->rows('games'));
        // the pre-existing game was not touched
        $this->assertSame(['Tim', 'Ravi'], array_column(Groups::gameById($this->pdo(), self::U1)['players'], 'name'));
        $this->assertSame('approved', $r->body['request']['status']);
    }

    public function test_approve_twice_returns_conflict(): void
    {
        [$tim, $admin, $id] = $this->setupRequest();
        $this->assertSame(200, $this->call('POST', "/admin/sync-requests/$id/approve", ['mode' => 'new'], $admin['token'])->status);
        $games = $this->rows('games');
        $groups = $this->rows('game_groups');

        $r = $this->call('POST', "/admin/sync-requests/$id/approve", ['mode' => 'new'], $admin['token']);
        $this->assertSame(409, $r->status);
        $this->assertSame('already_resolved', $r->body['error']);
        $this->assertSame('Dit verzoek is al afgehandeld.', $r->body['message']);
        $this->assertSame($games, $this->rows('games'));
        $this->assertSame($groups, $this->rows('game_groups'));

        $this->assertSame(409, $this->call('POST', "/admin/sync-requests/$id/reject", ['reason' => 'x'], $admin['token'])->status);
    }

    public function test_reject_stores_reason_and_status(): void
    {
        [$tim, $admin, $id] = $this->setupRequest();

        $this->assertSame(422, $this->call('POST', "/admin/sync-requests/$id/reject", ['reason' => '  '], $admin['token'])->status);
        $this->assertSame(422, $this->call('POST', "/admin/sync-requests/$id/reject", ['reason' => str_repeat('x', 201)], $admin['token'])->status);

        $r = $this->call('POST', "/admin/sync-requests/$id/reject", ['reason' => 'Dubbele groep'], $admin['token']);
        $this->assertSame(200, $r->status);
        $this->assertSame('rejected', $r->body['request']['status']);
        $this->assertSame('Dubbele groep', $r->body['request']['reject_reason']);
        $row = $this->pdo()->query("SELECT resolved_by, resolved_at FROM sync_requests WHERE id = $id")->fetch();
        $this->assertSame($admin['id'], (int)$row['resolved_by']);
        $this->assertNotNull($row['resolved_at']);
        $this->assertSame(0, $this->rows('games'));

        $this->assertSame(404, $this->call('POST', '/admin/sync-requests/9999/reject', ['reason' => 'x'], $admin['token'])->status);
        $this->assertSame('request_not_found', $this->call('POST', '/admin/sync-requests/9999/approve', ['mode' => 'new'], $admin['token'])->body['error']);
    }

    public function test_non_admin_cannot_approve(): void
    {
        [$tim, $admin, $id] = $this->setupRequest();
        $r = $this->call('POST', "/admin/sync-requests/$id/approve", ['mode' => 'new'], $tim['token']);
        $this->assertSame(403, $r->status);
        $this->assertSame('admin_only', $r->body['error']);
        $this->assertSame(403, $this->call('POST', "/admin/sync-requests/$id/reject", ['reason' => 'x'], $tim['token'])->status);
        $this->assertSame(0, $this->rows('games'));
    }

    public function test_approve_rolls_back_on_invalid_mapping(): void
    {
        [$tim, $admin, $id] = $this->setupRequest();
        [$gid] = $this->existingGroup($tim);
        $foreignGroup = Groups::create($this->pdo(), 'Andere', $tim['id'], 10);
        $foreign = Groups::resolvePlayer($this->pdo(), $foreignGroup, 'Vreemd');
        $groups = $this->rows('game_groups');
        $players = $this->rows('players');

        $r = $this->call('POST', "/admin/sync-requests/$id/approve",
            ['mode' => 'link', 'group_id' => $gid, 'mapping' => ['Rav' => $foreign, 'Piet' => null]], $admin['token']);
        $this->assertSame(422, $r->status);
        $this->assertSame(0, $this->rows('games'));
        $this->assertSame($groups, $this->rows('game_groups'));
        $this->assertSame($players, $this->rows('players'));
        $this->assertSame('pending', $this->pdo()->query("SELECT status FROM sync_requests WHERE id = $id")->fetchColumn());

        // failure mid-import (two names mapped to one player) also rolls everything back, member added included
        $other = $this->makeUser('owner');
        [$gid2, $ravi2] = $this->existingGroup($other);
        $r = $this->call('POST', "/admin/sync-requests/$id/approve",
            ['mode' => 'link', 'group_id' => $gid2, 'mapping' => ['Tim' => $ravi2, 'Rav' => $ravi2]], $admin['token']);
        $this->assertSame(422, $r->status);
        $this->assertSame(0, $this->rows('games'));
        $this->assertFalse(Groups::isMember($this->pdo(), $gid2, $tim['id']));
        $this->assertSame('pending', $this->pdo()->query("SELECT status FROM sync_requests WHERE id = $id")->fetchColumn());
    }

    public function test_link_requires_existing_group_and_mode(): void
    {
        [$tim, $admin, $id] = $this->setupRequest();
        $r = $this->call('POST', "/admin/sync-requests/$id/approve", ['mode' => 'link', 'group_id' => 9999, 'mapping' => []], $admin['token']);
        $this->assertSame(404, $r->status);
        $this->assertSame('group_not_found', $r->body['error']);
        $this->assertSame(422, $this->call('POST', "/admin/sync-requests/$id/approve", ['mode' => 'bogus'], $admin['token'])->status);
    }
}
