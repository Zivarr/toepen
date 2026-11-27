<?php
declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

final class GamesTest extends TestCase
{
    private const UUID = '3f2b8c1e-5d4a-4e7b-9a10-1c2d3e4f5a6b';

    private function upload(int $groupId, array $over = []): array
    {
        return array_merge([
            'id' => self::UUID,
            'group_id' => $groupId,
            'started_at' => '2026-11-18T21:04:05+01:00',
            'duration_ms' => 600000,
            'max_penalty_points' => 15,
            'ended_early' => false,
            'winner' => 'Ravi',
            'players' => [
                ['name' => 'Tim', 'final_score' => 15, 'boer_count' => 2],
                ['name' => 'Ravi', 'final_score' => 7, 'boer_count' => 0],
            ],
        ], $over);
    }

    private function setup2(): array
    {
        $tim = $this->makeUser('tim');
        $g = Groups::create($this->pdo(), 'Werk', $tim['id'], 15);
        return [$tim, $g];
    }

    private function playerCount(int $g): int
    {
        $st = $this->pdo()->prepare('SELECT COUNT(*) FROM players WHERE group_id = ?');
        $st->execute([$g]);
        return (int)$st->fetchColumn();
    }

    public function test_upload_game_returns_201_and_appears_in_groups(): void
    {
        [$tim, $g] = $this->setup2();
        $r = $this->call('POST', '/games', $this->upload($g), $tim['token']);
        $this->assertSame(201, $r->status);
        $game = $r->body['game'];
        $this->assertSame(self::UUID, $game['id']);
        $this->assertSame('tim', $game['recorded_by']);
        $this->assertSame('2026-11-18T20:04:05+00:00', $game['started_at']);
        $this->assertSame('Ravi', $game['winner']);
        $this->assertSame(['Tim', 'Ravi'], array_column($game['players'], 'name'));
        $this->assertSame(2, $game['players'][0]['boer_count']);
        $this->assertArrayNotHasKey('duplicate', $r->body);

        $list = $this->call('GET', '/groups', null, $tim['token']);
        $this->assertSame(self::UUID, $list->body['groups'][0]['games'][0]['id']);
    }

    public function test_is_anita_round_trips(): void
    {
        [$tim, $g] = $this->setup2();
        $r = $this->call('POST', '/games', $this->upload($g, ['players' => [
            ['name' => 'Tim', 'final_score' => 15, 'boer_count' => 2, 'is_anita' => true],
            ['name' => 'Ravi', 'final_score' => 7, 'boer_count' => 0, 'is_anita' => false],
        ]]), $tim['token']);
        $this->assertSame(201, $r->status);
        $list = $this->call('GET', '/groups', null, $tim['token']);
        $players = $list->body['groups'][0]['games'][0]['players'];
        $this->assertTrue($players[0]['is_anita']);
        $this->assertFalse($players[1]['is_anita']);
    }

    public function test_missing_is_anita_defaults_false(): void
    {
        [$tim, $g] = $this->setup2();
        $this->call('POST', '/games', $this->upload($g), $tim['token']);
        $list = $this->call('GET', '/groups', null, $tim['token']);
        foreach ($list->body['groups'][0]['games'][0]['players'] as $p) {
            $this->assertFalse($p['is_anita']);
        }
    }

    public function test_duplicate_upload_returns_200_duplicate_true(): void
    {
        [$tim, $g] = $this->setup2();
        $this->call('POST', '/games', $this->upload($g), $tim['token']);
        $r = $this->call('POST', '/games', $this->upload($g), $tim['token']);
        $this->assertSame(200, $r->status);
        $this->assertTrue($r->body['duplicate']);
        $this->assertSame(self::UUID, $r->body['game']['id']);
        $this->assertSame(1, (int)$this->pdo()->query('SELECT COUNT(*) FROM games')->fetchColumn());
    }

    public function test_duplicate_upload_with_different_body_keeps_original(): void
    {
        [$tim, $g] = $this->setup2();
        $this->call('POST', '/games', $this->upload($g), $tim['token']);
        $other = $this->upload($g, [
            'duration_ms' => 1,
            'winner' => 'Tim',
            'players' => [
                ['name' => 'Tim', 'final_score' => 3, 'boer_count' => 9],
                ['name' => 'Ravi', 'final_score' => 4, 'boer_count' => 9],
                ['name' => 'Nieuw', 'final_score' => 5, 'boer_count' => 9],
            ],
        ]);
        $r = $this->call('POST', '/games', $other, $tim['token']);
        $this->assertSame(200, $r->status);
        $this->assertTrue($r->body['duplicate']);
        $this->assertSame(15, $r->body['game']['players'][0]['final_score']);
        $this->assertSame(600000, $r->body['game']['duration_ms']);
        $this->assertSame('Ravi', $r->body['game']['winner']);
        $this->assertSame(2, $this->playerCount($g));
        $this->assertSame(2, (int)$this->pdo()->query('SELECT COUNT(*) FROM game_players')->fetchColumn());
    }

    public function test_upload_creates_new_player_by_name(): void
    {
        [$tim, $g] = $this->setup2();
        $this->call('POST', '/games', $this->upload($g, ['winner' => null, 'players' => [
            ['name' => ' kees ', 'final_score' => 1, 'boer_count' => 0],
            ['name' => 'Ravi', 'final_score' => 2, 'boer_count' => 0],
        ]]), $tim['token']);
        $this->assertSame(2, $this->playerCount($g));
        $st = $this->pdo()->prepare('SELECT COUNT(*) FROM players WHERE group_id = ? AND name = ?');
        $st->execute([$g, 'Kees']);
        $this->assertSame(1, (int)$st->fetchColumn());
    }

    public function test_upload_matches_existing_player_case_insensitively(): void
    {
        [$tim, $g] = $this->setup2();
        Groups::resolvePlayer($this->pdo(), $g, 'Ravi');
        Groups::resolvePlayer($this->pdo(), $g, 'Tim');
        $r = $this->call('POST', '/games', $this->upload($g, ['winner' => 'ravi', 'players' => [
            ['name' => 'tim', 'final_score' => 1, 'boer_count' => 0],
            ['name' => 'ravi', 'final_score' => 2, 'boer_count' => 0],
        ]]), $tim['token']);
        $this->assertSame(201, $r->status);
        $this->assertSame(2, $this->playerCount($g));
        $this->assertSame('Ravi', $r->body['game']['winner']);
    }

    public function test_upload_follows_merge_chain(): void
    {
        [$tim, $g] = $this->setup2();
        $rav = Groups::resolvePlayer($this->pdo(), $g, 'Rav');
        $ravi = Groups::resolvePlayer($this->pdo(), $g, 'Ravi');
        $raviB = Groups::resolvePlayer($this->pdo(), $g, 'Ravi B');
        $this->pdo()->prepare('UPDATE players SET merged_into_player_id = ? WHERE id = ?')->execute([$ravi, $rav]);
        $this->pdo()->prepare('UPDATE players SET merged_into_player_id = ? WHERE id = ?')->execute([$raviB, $ravi]);
        $r = $this->call('POST', '/games', $this->upload($g, ['winner' => 'rav', 'players' => [
            ['name' => 'Tim', 'final_score' => 1, 'boer_count' => 0],
            ['name' => 'rav', 'final_score' => 2, 'boer_count' => 0],
        ]]), $tim['token']);
        $this->assertSame(201, $r->status);
        $this->assertSame('Ravi B', $r->body['game']['winner']);
        $this->assertSame('Ravi B', $r->body['game']['players'][1]['name']);
        $st = $this->pdo()->prepare('SELECT player_id FROM game_players WHERE game_id = ? AND seat = 1');
        $st->execute([self::UUID]);
        $this->assertSame($raviB, (int)$st->fetchColumn());
    }

    public function test_two_names_resolving_to_same_player_is_422_and_stores_nothing(): void
    {
        [$tim, $g] = $this->setup2();
        $rav = Groups::resolvePlayer($this->pdo(), $g, 'Rav');
        $ravi = Groups::resolvePlayer($this->pdo(), $g, 'Ravi');
        $this->pdo()->prepare('UPDATE players SET merged_into_player_id = ? WHERE id = ?')->execute([$ravi, $rav]);
        $r = $this->call('POST', '/games', $this->upload($g, ['winner' => null, 'players' => [
            ['name' => 'Rav', 'final_score' => 1, 'boer_count' => 0],
            ['name' => 'Ravi', 'final_score' => 2, 'boer_count' => 0],
        ]]), $tim['token']);
        $this->assertSame(422, $r->status);
        $this->assertSame(0, (int)$this->pdo()->query('SELECT COUNT(*) FROM games')->fetchColumn());
    }

    public function test_upload_to_non_member_group_is_403(): void
    {
        [$tim, $g] = $this->setup2();
        $sanne = $this->makeUser('sanne');
        $r = $this->call('POST', '/games', $this->upload($g), $sanne['token']);
        $this->assertSame(403, $r->status);
        $this->assertSame('not_member', $r->body['error']);
        $this->assertSame(404, $this->call('POST', '/games', $this->upload(9999), $tim['token'])->status);
    }

    public function test_duplicate_id_in_other_group_does_not_leak(): void
    {
        [$tim, $g] = $this->setup2();
        $this->call('POST', '/games', $this->upload($g), $tim['token']);
        $sanne = $this->makeUser('sanne');
        $g2 = Groups::create($this->pdo(), 'Ander', $sanne['id'], 15);
        $r = $this->call('POST', '/games', $this->upload($g2), $sanne['token']);
        $this->assertSame(403, $r->status);
    }

    public static function invalidProvider(): array
    {
        $p = fn(string $n, int $s = 1) => ['name' => $n, 'final_score' => $s, 'boer_count' => 0];
        return [
            'one player' => [['players' => [$p('Tim')], 'winner' => null]],
            'nine players' => [['players' => array_map(fn($i) => $p("P$i"), range(1, 9)), 'winner' => null]],
            'duplicate names' => [['players' => [$p('Tim'), $p('tim')], 'winner' => null]],
            'winner not in players' => [['winner' => 'Piet']],
            'ended early with winner' => [['ended_early' => true, 'winner' => 'Ravi']],
            'score above max' => [['players' => [$p('Tim', 16), $p('Ravi')], 'winner' => null]],
            'negative score' => [['players' => [$p('Tim', -1), $p('Ravi')], 'winner' => null]],
            'bad uuid' => [['id' => 'not-a-uuid']],
            'bad started_at' => [['started_at' => 'gisteren']],
            'started_at without offset' => [['started_at' => '2026-11-18T21:04:05']],
            'empty name' => [['players' => [$p('  '), $p('Ravi')], 'winner' => null]],
            'long name' => [['players' => [$p(str_repeat('x', 41)), $p('Ravi')], 'winner' => null]],
            'max zero' => [['max_penalty_points' => 0]],
            'max 101' => [['max_penalty_points' => 101]],
            'negative duration' => [['duration_ms' => -1]],
            'anita not bool' => [['players' => [['name' => 'Tim', 'final_score' => 15, 'boer_count' => 0, 'is_anita' => 1], $p('Ravi')], 'winner' => null]],
            'two anitas' => [['players' => [['name' => 'Tim', 'final_score' => 15, 'boer_count' => 0, 'is_anita' => true], ['name' => 'Ravi', 'final_score' => 15, 'boer_count' => 0, 'is_anita' => true]], 'winner' => null]],
            'anita below max' => [['players' => [['name' => 'Tim', 'final_score' => 14, 'boer_count' => 0, 'is_anita' => true], $p('Ravi')], 'winner' => null]],
            'negative boer' => [['players' => [['name' => 'Tim', 'final_score' => 1, 'boer_count' => -1], $p('Ravi')], 'winner' => null]],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('invalidProvider')]
    public function test_validation_rejects(array $over): void
    {
        [$tim, $g] = $this->setup2();
        $r = $this->call('POST', '/games', $this->upload($g, $over), $tim['token']);
        $this->assertSame(422, $r->status);
        $this->assertSame('validation_failed', $r->body['error']);
        $this->assertStringStartsWith('Ongeldig spel: ', $r->body['message']);
        $this->assertSame(0, (int)$this->pdo()->query('SELECT COUNT(*) FROM games')->fetchColumn());
    }

    public function test_delete_own_game_soft_deletes(): void
    {
        [$tim, $g] = $this->setup2();
        $this->call('POST', '/games', $this->upload($g), $tim['token']);
        $r = $this->call('DELETE', '/games/' . self::UUID, null, $tim['token']);
        $this->assertSame(204, $r->status);
        $list = $this->call('GET', '/groups', null, $tim['token']);
        $this->assertSame([], $list->body['groups'][0]['games']);
        $row = $this->pdo()->query('SELECT deleted_at, deleted_by FROM games')->fetch();
        $this->assertNotNull($row['deleted_at']);
        $this->assertSame($tim['id'], (int)$row['deleted_by']);
        $this->assertSame(404, $this->call('DELETE', '/games/' . self::UUID, null, $tim['token'])->status);
    }

    public function test_delete_someone_elses_game_is_403_for_member(): void
    {
        [$tim, $g] = $this->setup2();
        $sanne = $this->makeUser('sanne');
        $this->pdo()->prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)')->execute([$g, $sanne['id']]);
        $this->call('POST', '/games', $this->upload($g), $tim['token']);
        $r = $this->call('DELETE', '/games/' . self::UUID, null, $sanne['token']);
        $this->assertSame(403, $r->status);
        $this->assertSame('not_allowed', $r->body['error']);
        $this->assertSame('Je mag alleen je eigen spellen verwijderen.', $r->body['message']);
        $this->assertNull($this->pdo()->query('SELECT deleted_at FROM games')->fetchColumn());
    }

    public function test_removed_member_cannot_delete_own_game(): void
    {
        [$tim, $g] = $this->setup2();
        $sanne = $this->makeUser('sanne');
        $this->pdo()->prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)')->execute([$g, $sanne['id']]);
        $this->call('POST', '/games', $this->upload($g), $sanne['token']);
        $this->pdo()->prepare('DELETE FROM group_members WHERE user_id = ?')->execute([$sanne['id']]);
        $this->assertSame(403, $this->call('DELETE', '/games/' . self::UUID, null, $sanne['token'])->status);
    }

    public function test_admin_can_delete_any_game(): void
    {
        [$tim, $g] = $this->setup2();
        $admin = $this->makeUser('root', true);
        $this->call('POST', '/games', $this->upload($g), $tim['token']);
        $this->assertSame(204, $this->call('DELETE', '/games/' . self::UUID, null, $admin['token'])->status);
        $this->assertSame($admin['id'], (int)$this->pdo()->query('SELECT deleted_by FROM games')->fetchColumn());
    }

    public function test_delete_unknown_game_is_404(): void
    {
        [$tim] = $this->setup2();
        $r = $this->call('DELETE', '/games/' . self::UUID, null, $tim['token']);
        $this->assertSame(404, $r->status);
        $this->assertSame('game_not_found', $r->body['error']);
    }
}
