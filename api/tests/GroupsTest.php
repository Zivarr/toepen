<?php
declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

final class GroupsTest extends TestCase
{
    private function group(string $name, int $creator, int $max = 15, array $members = []): int
    {
        $id = Groups::create($this->pdo(), $name, $creator, $max);
        foreach ($members as $m) {
            $this->pdo()->prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)')->execute([$id, $m]);
        }
        return $id;
    }

    private function player(int $groupId, string $name): int
    {
        return Groups::resolvePlayer($this->pdo(), $groupId, $name);
    }

    /** @param int[] $playerIds */
    private function game(int $groupId, int $recorder, array $playerIds, string $startedAt, ?int $winner = null, bool $deleted = false): string
    {
        $id = sprintf('%08x-0000-4000-8000-%012x', random_int(0, 0xffffffff), random_int(0, 0xffffffffff));
        $this->pdo()->prepare(
            'INSERT INTO games (id, group_id, recorded_by, started_at, duration_ms, max_penalty_points, ended_early, winner_player_id, deleted_at)
             VALUES (?, ?, ?, ?, 120000, 15, 0, ?, ?)'
        )->execute([$id, $groupId, $recorder, $startedAt, $winner, $deleted ? '2026-01-01 00:00:00' : null]);
        foreach ($playerIds as $seat => $pid) {
            $this->pdo()->prepare('INSERT INTO game_players (game_id, player_id, seat, final_score, boer_count) VALUES (?, ?, ?, ?, ?)')
                ->execute([$id, $pid, $seat, 3, 1]);
        }
        return $id;
    }

    public function test_groups_lists_only_my_groups(): void
    {
        $tim = $this->makeUser('tim');
        $sanne = $this->makeUser('sanne');
        $a = $this->group('A', $tim['id']);
        $this->group('B', $sanne['id']);
        $r = $this->call('GET', '/groups', null, $tim['token']);
        $this->assertSame(200, $r->status);
        $this->assertCount(1, $r->body['groups']);
        $this->assertSame($a, $r->body['groups'][0]['id']);
        $this->assertNotEmpty($r->headers['ETag'] ?? null);
    }

    public function test_group_shape_and_player_order(): void
    {
        $tim = $this->makeUser('tim');
        $g = $this->group('Werk', $tim['id'], 12);
        $cas = $this->player($g, 'cas');
        $bram = $this->player($g, 'bram');
        $anna = $this->player($g, 'anna');
        $this->game($g, $tim['id'], [$cas, $bram, $anna], '2026-01-01 10:00:00');
        $this->game($g, $tim['id'], [$bram, $anna], '2026-01-02 10:00:00', $anna);
        $this->game($g, $tim['id'], [$bram, $anna], '2026-01-03 10:00:00');
        $this->game($g, $tim['id'], [$cas, $bram, $anna], '2026-01-04 10:00:00', null, true);
        $api = Groups::toApi($this->pdo(), $g);
        $this->assertSame('Werk', $api['name']);
        $this->assertSame('tim', $api['creator']);
        $this->assertSame(12, $api['max_penalty_points']);
        $this->assertSame(['Anna', 'Bram', 'Cas'], array_column($api['players'], 'name'));
        $this->assertSame([3, 3, 1], array_column($api['players'], 'games_played'));
        $this->assertCount(3, $api['games']);
        $this->assertSame('2026-01-03T10:00:00+00:00', $api['games'][0]['started_at']);
        $this->assertNull($api['games'][0]['winner']);
        $this->assertSame('Anna', $api['games'][1]['winner']);
        $this->assertSame('tim', $api['games'][0]['recorded_by']);
        $this->assertSame(['name' => 'Cas', 'final_score' => 3, 'boer_count' => 1], $api['games'][2]['players'][0]);
        $this->assertFalse($api['games'][0]['ended_early']);
    }

    public function test_merged_players_excluded(): void
    {
        $tim = $this->makeUser('tim');
        $g = $this->group('W', $tim['id']);
        $a = $this->player($g, 'Ravi');
        $b = $this->player($g, 'Rav');
        $this->pdo()->prepare('UPDATE players SET merged_into_player_id = ? WHERE id = ?')->execute([$a, $b]);
        $this->assertSame($a, Groups::resolvePlayer($this->pdo(), $g, 'rav'));
        $this->assertSame(['Ravi'], array_column(Groups::toApi($this->pdo(), $g)['players'], 'name'));
    }

    public function test_groups_returns_304_for_matching_etag(): void
    {
        $tim = $this->makeUser('tim');
        $this->group('A', $tim['id']);
        $r1 = $this->call('GET', '/groups', null, $tim['token']);
        $r2 = $this->call('GET', '/groups', null, $tim['token'], ['If-None-Match' => $r1->headers['ETag']]);
        $this->assertSame(304, $r2->status);
        $this->assertNull($r2->body);
    }

    public function test_etag_if_none_match_is_lenient(): void
    {
        $tim = $this->makeUser('tim');
        $this->group('A', $tim['id']);
        $etag = $this->call('GET', '/groups', null, $tim['token'])->headers['ETag'];
        $bare = substr($etag, 1, -1);
        $cases = [
            'W/' . $etag => 304,
            '"' . $bare . '-gzip"' => 304,
            '"zzz", W/' . $etag => 304,
            '"zzz"' => 200,
        ];
        foreach ($cases as $header => $status) {
            $r = $this->call('GET', '/groups', null, $tim['token'], ['If-None-Match' => $header]);
            $this->assertSame($status, $r->status, $header);
        }
    }

    public function test_add_player_title_cases_and_returns_201(): void
    {
        $tim = $this->makeUser('tim');
        $g = $this->group('A', $tim['id']);
        $r = $this->call('POST', '/players', ['group_id' => $g, 'name' => ' kees '], $tim['token']);
        $this->assertSame(201, $r->status);
        $this->assertSame('Kees', $r->body['player']['name']);
        $this->assertSame(0, $r->body['player']['games_played']);
    }

    public function test_add_player_existing_case_insensitive_is_409_with_player(): void
    {
        $tim = $this->makeUser('tim');
        $g = $this->group('A', $tim['id']);
        $this->player($g, 'Ravi');
        $r = $this->call('POST', '/players', ['group_id' => $g, 'name' => 'RAVI'], $tim['token']);
        $this->assertSame(409, $r->status);
        $this->assertSame('name_taken', $r->body['error']);
        $this->assertSame('Ravi', $r->body['player']['name']);
    }

    public function test_add_player_409_returns_live_player_at_end_of_merge_chain(): void
    {
        $tim = $this->makeUser('tim');
        $g = $this->group('A', $tim['id']);
        $rav = $this->player($g, 'Rav');
        $ravi = $this->player($g, 'Ravi');
        $this->pdo()->prepare('UPDATE players SET merged_into_player_id = ? WHERE id = ?')->execute([$ravi, $rav]);
        $r = $this->call('POST', '/players', ['group_id' => $g, 'name' => 'rav'], $tim['token']);
        $this->assertSame(409, $r->status);
        $this->assertSame($ravi, $r->body['player']['id']);
        $this->assertSame('Ravi', $r->body['player']['name']);
    }

    public function test_add_player_concurrent_duplicate_insert_is_409_not_500(): void
    {
        $tim = $this->makeUser('tim');
        $g = $this->group('A', $tim['id']);
        $existing = $this->player($g, 'Ravi');
        // Simulates the race: the pre-check saw nothing, the insert then hits the unique key.
        try {
            GroupHandlers::createPlayer($this->pdo(), $g, 'Ravi');
            $this->fail('expected ApiError');
        } catch (ApiError $e) {
            $this->assertSame(409, $e->status);
            $this->assertSame('name_taken', $e->errorCode);
            $this->assertSame($existing, $e->extra['player']['id']);
        }
    }

    public function test_add_player_validation(): void
    {
        $tim = $this->makeUser('tim');
        $g = $this->group('A', $tim['id']);
        $this->assertSame(422, $this->call('POST', '/players', ['group_id' => $g, 'name' => '  '], $tim['token'])->status);
        $this->assertSame(422, $this->call('POST', '/players', ['group_id' => $g, 'name' => str_repeat('x', 41)], $tim['token'])->status);
        $this->assertSame(404, $this->call('POST', '/players', ['group_id' => 9999, 'name' => 'x'], $tim['token'])->status);
    }

    public function test_add_player_to_foreign_group_is_403(): void
    {
        $tim = $this->makeUser('tim');
        $sanne = $this->makeUser('sanne');
        $g = $this->group('B', $sanne['id']);
        $r = $this->call('POST', '/players', ['group_id' => $g, 'name' => 'Kees'], $tim['token']);
        $this->assertSame(403, $r->status);
        $this->assertSame('not_member', $r->body['error']);
    }

    public function test_patch_max_penalty_points(): void
    {
        $tim = $this->makeUser('tim');
        $g = $this->group('A', $tim['id']);
        $r = $this->call('PATCH', "/groups/$g", ['max_penalty_points' => 20], $tim['token']);
        $this->assertSame(200, $r->status);
        $this->assertSame(20, $r->body['group']['max_penalty_points']);
        $this->assertSame(422, $this->call('PATCH', "/groups/$g", ['max_penalty_points' => 0], $tim['token'])->status);
        $this->assertSame(422, $this->call('PATCH', "/groups/$g", ['max_penalty_points' => 'x'], $tim['token'])->status);
        $other = $this->makeUser('sanne');
        $this->assertSame(403, $this->call('PATCH', "/groups/$g", ['max_penalty_points' => 20], $other['token'])->status);
        $this->assertSame(404, $this->call('PATCH', '/groups/9999', ['max_penalty_points' => 20], $tim['token'])->status);
    }

    public function test_admin_passes_require_member(): void
    {
        $tim = $this->makeUser('tim');
        $admin = $this->makeUser('root', true);
        $g = $this->group('A', $tim['id']);
        $this->assertSame(200, $this->call('PATCH', "/groups/$g", ['max_penalty_points' => 20], $admin['token'])->status);
    }

    public function test_same_group_name_for_two_creators_shows_creator(): void
    {
        $tim = $this->makeUser('tim');
        $sanne = $this->makeUser('sanne');
        $a = $this->group('Work', $tim['id'], 15, [$sanne['id']]);
        $b = $this->group('Work', $sanne['id']);
        $r = $this->call('GET', '/groups', null, $sanne['token']);
        $byId = [];
        foreach ($r->body['groups'] as $grp) {
            $byId[$grp['id']] = $grp['creator'];
        }
        $this->assertSame([$a => 'tim', $b => 'sanne'], $byId);
    }
}
