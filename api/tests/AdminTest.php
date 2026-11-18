<?php
declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

final class AdminTest extends TestCase
{
    private const G1 = '3f2b8c1e-5d4a-4e7b-9a10-1c2d3e4f5a6b';
    private const G2 = '4a3c9d2f-6e5b-4f8c-8b21-2d3e4f5a6b7c';
    private const G3 = '5b4d0e30-7f6c-4a9d-9c32-3e4f5a6b7c8d';

    private function game(string $id, string $a, string $b, int $dur = 600000, string $start = '2026-11-18T21:00:00+01:00'): array
    {
        return [
            'id' => $id, 'started_at' => $start, 'duration_ms' => $dur, 'max_penalty_points' => 15,
            'ended_early' => false, 'winner' => $b,
            'players' => [
                ['name' => $a, 'final_score' => 15, 'boer_count' => 0],
                ['name' => $b, 'final_score' => 5, 'boer_count' => 0],
            ],
        ];
    }

    private function admin(): array
    {
        return $this->makeUser('admin', true);
    }

    private function addGame(int $gid, int $user, array $g): void
    {
        $this->assertTrue(Groups::insertGame($this->pdo(), $gid, $user, $g));
    }

    public function test_create_user_and_login_works(): void
    {
        $a = $this->admin();
        $r = $this->call('POST', '/admin/users', ['username' => 'nieuw.user', 'password' => 'wachtwoord1', 'is_admin' => false], $a['token']);
        $this->assertSame(201, $r->status);
        $this->assertSame('nieuw.user', $r->body['user']['username']);
        $this->assertFalse($r->body['user']['is_admin']);
        $l = $this->call('POST', '/login', ['username' => 'nieuw.user', 'password' => 'wachtwoord1']);
        $this->assertSame(200, $l->status);
        $bad = $this->call('POST', '/admin/users', ['username' => 'a!', 'password' => 'wachtwoord1'], $a['token']);
        $this->assertSame(422, $bad->status);
        $bad = $this->call('POST', '/admin/users', ['username' => 'okeee', 'password' => 'kort'], $a['token']);
        $this->assertSame(422, $bad->status);
        $list = $this->call('GET', '/admin/users', null, $a['token']);
        $this->assertSame(200, $list->status);
        $this->assertCount(2, $list->body['users']);
        $this->assertArrayHasKey('last_used_at', $list->body['users'][0]);
        $this->assertArrayHasKey('disabled', $list->body['users'][0]);
    }

    public function test_create_duplicate_username_case_insensitive_is_409(): void
    {
        $a = $this->admin();
        $this->makeUser('Tim');
        $r = $this->call('POST', '/admin/users', ['username' => 'tIM', 'password' => 'wachtwoord1'], $a['token']);
        $this->assertSame(409, $r->status);
        $this->assertSame('username_taken', $r->body['error']);
    }

    public function test_reset_password_then_old_password_fails(): void
    {
        $a = $this->admin();
        $u = $this->makeUser('tim');
        $r = $this->call('PATCH', '/admin/users/' . $u['id'], ['password' => 'nieuwwachtwoord'], $a['token']);
        $this->assertSame(200, $r->status);
        $this->assertSame(401, $this->call('POST', '/login', ['username' => 'tim', 'password' => 'geheim123'])->status);
        $this->assertSame(200, $this->call('POST', '/login', ['username' => 'tim', 'password' => 'nieuwwachtwoord'])->status);
        $this->assertSame(422, $this->call('PATCH', '/admin/users/' . $u['id'], ['password' => 'kort'], $a['token'])->status);
        $this->assertSame(404, $this->call('PATCH', '/admin/users/9999', ['password' => 'nieuwwachtwoord'], $a['token'])->status);
    }

    public function test_disable_user_blocks_login_and_tokens(): void
    {
        $a = $this->admin();
        $u = $this->makeUser('tim');
        $r = $this->call('PATCH', '/admin/users/' . $u['id'], ['disabled' => true], $a['token']);
        $this->assertSame(200, $r->status);
        $this->assertSame(401, $this->call('GET', '/me', null, $u['token'])->status);
        $this->assertSame(401, $this->call('POST', '/login', ['username' => 'tim', 'password' => 'geheim123'])->status);
        $this->call('PATCH', '/admin/users/' . $u['id'], ['disabled' => false], $a['token']);
        $this->assertSame(200, $this->call('GET', '/me', null, $u['token'])->status);
        // self-lockout guards
        $this->assertSame(422, $this->call('PATCH', '/admin/users/' . $a['id'], ['disabled' => true], $a['token'])->status);
        $this->assertSame(422, $this->call('PATCH', '/admin/users/' . $a['id'], ['is_admin' => false], $a['token'])->status);
        // promoting works
        $p = $this->call('PATCH', '/admin/users/' . $u['id'], ['is_admin' => true], $a['token']);
        $this->assertTrue($p->body['user']['is_admin']);
    }

    public function test_revoke_tokens_logs_out_all_devices(): void
    {
        $a = $this->admin();
        $u = $this->makeUser('tim');
        $t2 = Auth::issueToken($this->pdo(), $u['id'], 'phone');
        $this->assertSame(204, $this->call('POST', '/admin/users/' . $u['id'] . '/revoke-tokens', null, $a['token'])->status);
        $this->assertSame(401, $this->call('GET', '/me', null, $u['token'])->status);
        $this->assertSame(401, $this->call('GET', '/me', null, $t2)->status);
        $this->assertSame(404, $this->call('POST', '/admin/users/9999/revoke-tokens', null, $a['token'])->status);
    }

    public function test_add_member_is_idempotent_and_remove_member(): void
    {
        $a = $this->admin();
        $tim = $this->makeUser('tim');
        $kees = $this->makeUser('kees');
        $gid = Groups::create($this->pdo(), 'Vrienden', $tim['id'], 10);
        $this->assertSame(204, $this->call('POST', "/admin/groups/$gid/members", ['user_id' => $kees['id']], $a['token'])->status);
        $this->assertSame(204, $this->call('POST', "/admin/groups/$gid/members", ['user_id' => $kees['id']], $a['token'])->status);
        $this->assertTrue(Groups::isMember($this->pdo(), $gid, $kees['id']));
        $this->assertSame(404, $this->call('POST', "/admin/groups/$gid/members", ['user_id' => 9999], $a['token'])->status);
        $this->assertSame(404, $this->call('POST', '/admin/groups/9999/members', ['user_id' => $kees['id']], $a['token'])->status);
        $this->assertSame(204, $this->call('DELETE', "/admin/groups/$gid/members/{$kees['id']}", null, $a['token'])->status);
        $this->assertFalse(Groups::isMember($this->pdo(), $gid, $kees['id']));
        $this->assertSame(404, $this->call('DELETE', "/admin/groups/$gid/members/{$kees['id']}", null, $a['token'])->status);
    }

    public function test_admin_groups_list_shows_creator_members_and_game_count(): void
    {
        $a = $this->admin();
        $tim = $this->makeUser('tim');
        $kees = $this->makeUser('kees');
        $gid = Groups::create($this->pdo(), 'Vrienden', $tim['id'], 10);
        $this->call('POST', "/admin/groups/$gid/members", ['user_id' => $kees['id']], $a['token']);
        $this->addGame($gid, $tim['id'], $this->game(self::G1, 'Tim', 'Rav'));
        $this->addGame($gid, $tim['id'], $this->game(self::G2, 'Tim', 'Rav'));
        $this->call('DELETE', '/games/' . self::G2, null, $a['token']);
        $r = $this->call('GET', '/admin/groups', null, $a['token']);
        $this->assertSame(200, $r->status);
        $g = $r->body['groups'][0];
        $this->assertSame('tim', $g['creator']);
        $this->assertSame(1, $g['game_count']);
        $this->assertCount(2, $g['members']);
        $this->assertSame(['id', 'username', 'is_admin'], array_keys($g['members'][0]));
    }

    public function test_merge_players_moves_games_and_hides_source(): void
    {
        $a = $this->admin();
        $tim = $this->makeUser('tim');
        $gid = Groups::create($this->pdo(), 'Vrienden', $tim['id'], 15);
        $this->addGame($gid, $tim['id'], $this->game(self::G1, 'Tim', 'Rav'));
        $this->addGame($gid, $tim['id'], $this->game(self::G2, 'Tim', 'Ravi'));
        $rav = Groups::findPlayerByName($this->pdo(), $gid, 'Rav')['id'];
        $ravi = Groups::findPlayerByName($this->pdo(), $gid, 'Ravi')['id'];
        $r = $this->call('POST', '/admin/players/merge', ['source_player_id' => $rav, 'target_player_id' => $ravi], $a['token']);
        $this->assertSame(204, $r->status);
        $g = $this->call('GET', '/groups', null, $tim['token'])->body['groups'][0];
        $names = array_column($g['players'], 'name');
        $this->assertNotContains('Rav', $names);
        $ravRow = $g['players'][array_search('Ravi', $names)];
        $this->assertSame(2, $ravRow['games_played']);
        $this->assertSame('Ravi', Groups::gameById($this->pdo(), self::G1)['winner']);
        // later uploads with the old name resolve to the target
        $this->assertSame($ravi, Groups::resolvePlayer($this->pdo(), $gid, 'Rav'));
        // same id, unknown id
        $this->assertSame(422, $this->call('POST', '/admin/players/merge', ['source_player_id' => $ravi, 'target_player_id' => $ravi], $a['token'])->status);
        $this->assertSame(404, $this->call('POST', '/admin/players/merge', ['source_player_id' => 9999, 'target_player_id' => $ravi], $a['token'])->status);
    }

    public function test_merge_players_in_same_game_is_422_and_changes_nothing(): void
    {
        $a = $this->admin();
        $tim = $this->makeUser('tim');
        $gid = Groups::create($this->pdo(), 'Vrienden', $tim['id'], 15);
        $this->addGame($gid, $tim['id'], $this->game(self::G1, 'Tim', 'Rav'));
        $t = Groups::findPlayerByName($this->pdo(), $gid, 'Tim')['id'];
        $rv = Groups::findPlayerByName($this->pdo(), $gid, 'Rav')['id'];
        $r = $this->call('POST', '/admin/players/merge', ['source_player_id' => $t, 'target_player_id' => $rv], $a['token']);
        $this->assertSame(422, $r->status);
        $this->assertSame('merge_conflict', $r->body['error']);
        $this->assertNull($this->pdo()->query("SELECT merged_into_player_id FROM players WHERE id = $t")->fetchColumn());
        $this->assertSame(1, (int)$this->pdo()->query("SELECT COUNT(*) FROM game_players WHERE player_id = $t")->fetchColumn());
        $this->assertSame(1, (int)$this->pdo()->query("SELECT COUNT(*) FROM game_players WHERE player_id = $rv")->fetchColumn());
    }

    public function test_merge_players_across_groups_is_422(): void
    {
        $a = $this->admin();
        $tim = $this->makeUser('tim');
        $g1 = Groups::create($this->pdo(), 'Een', $tim['id'], 15);
        $g2 = Groups::create($this->pdo(), 'Twee', $tim['id'], 15);
        $p1 = Groups::resolvePlayer($this->pdo(), $g1, 'Tim');
        $p2 = Groups::resolvePlayer($this->pdo(), $g2, 'Tim');
        $this->assertSame(422, $this->call('POST', '/admin/players/merge', ['source_player_id' => $p1, 'target_player_id' => $p2], $a['token'])->status);
    }

    public function test_merge_groups_moves_games_members_and_merges_same_name_players(): void
    {
        $a = $this->admin();
        $tim = $this->makeUser('tim');
        $kees = $this->makeUser('kees');
        $src = Groups::create($this->pdo(), 'Bron', $kees['id'], 15);
        $dst = Groups::create($this->pdo(), 'Doel', $tim['id'], 15);
        $this->addGame($src, $kees['id'], $this->game(self::G1, 'Tim', 'Nieuw'));
        $this->addGame($dst, $tim['id'], $this->game(self::G2, 'TIM', 'Rav'));
        $srcTim = Groups::findPlayerByName($this->pdo(), $src, 'Tim')['id'];
        $dstTim = Groups::findPlayerByName($this->pdo(), $dst, 'Tim')['id'];

        $r = $this->call('POST', '/admin/groups/merge', ['source_group_id' => $src, 'target_group_id' => $dst], $a['token']);
        $this->assertSame(200, $r->status);
        $this->assertSame($dst, $r->body['group']['id']);
        $this->assertCount(2, $r->body['group']['games']);
        $byId = array_column($r->body['group']['players'], null, 'id');
        $this->assertSame(2, $byId[$dstTim]['games_played']);
        $byName = array_column($r->body['group']['players'], null, 'name');
        $this->assertArrayHasKey('Nieuw', $byName);
        $this->assertSame($dst, (int)$this->pdo()->query("SELECT group_id FROM players WHERE name='Nieuw'")->fetchColumn());
        // the same-name source row is folded into the target and removed (it cannot move: unique name per group)
        $this->assertSame(0, (int)$this->pdo()->query("SELECT COUNT(*) FROM players WHERE id=$srcTim")->fetchColumn());
        $this->assertTrue(Groups::isMember($this->pdo(), $dst, $kees['id']));
        $this->assertSame(0, (int)$this->pdo()->query("SELECT COUNT(*) FROM game_groups WHERE id=$src")->fetchColumn());
        $this->assertSame(0, (int)$this->pdo()->query("SELECT COUNT(*) FROM group_members WHERE group_id=$src")->fetchColumn());
        $this->assertSame(422, $this->call('POST', '/admin/groups/merge', ['source_group_id' => $dst, 'target_group_id' => $dst], $a['token'])->status);
        $this->assertSame(404, $this->call('POST', '/admin/groups/merge', ['source_group_id' => 9999, 'target_group_id' => $dst], $a['token'])->status);
    }

    public function test_bin_lists_deleted_and_restore_brings_back(): void
    {
        $a = $this->admin();
        $tim = $this->makeUser('tim');
        $gid = Groups::create($this->pdo(), 'Vrienden', $tim['id'], 15);
        $this->addGame($gid, $tim['id'], $this->game(self::G1, 'Tim', 'Rav'));
        $this->call('DELETE', '/games/' . self::G1, null, $a['token']);
        $r = $this->call('GET', '/admin/games/deleted', null, $a['token']);
        $this->assertSame(200, $r->status);
        $this->assertCount(1, $r->body['games']);
        $this->assertSame(self::G1, $r->body['games'][0]['id']);
        $this->assertSame('admin', $r->body['games'][0]['deleted_by']);
        $this->assertNotEmpty($r->body['games'][0]['deleted_at']);
        $this->assertSame(204, $this->call('POST', '/admin/games/' . self::G1 . '/restore', null, $a['token'])->status);
        $this->assertCount(1, Groups::gamesFor($this->pdo(), $gid));
        $this->assertCount(0, $this->call('GET', '/admin/games/deleted', null, $a['token'])->body['games']);
        $this->assertSame(404, $this->call('POST', '/admin/games/' . self::G1 . '/restore', null, $a['token'])->status);
        $this->assertSame(404, $this->call('POST', '/admin/games/' . self::G3 . '/restore', null, $a['token'])->status);
    }

    public function test_delete_games_short_only_soft_deletes_under_60s(): void
    {
        $a = $this->admin();
        $tim = $this->makeUser('tim');
        $gid = Groups::create($this->pdo(), 'Vrienden', $tim['id'], 15);
        $this->addGame($gid, $tim['id'], $this->game(self::G1, 'Tim', 'Rav', 59999));
        $this->addGame($gid, $tim['id'], $this->game(self::G2, 'Tim', 'Rav', 60000));
        $r = $this->call('POST', "/admin/groups/$gid/delete-games", ['short_only' => true], $a['token']);
        $this->assertSame(200, $r->status);
        $this->assertSame(1, $r->body['deleted']);
        $this->assertSame([self::G2], array_column(Groups::gamesFor($this->pdo(), $gid), 'id'));
        $r = $this->call('POST', "/admin/groups/$gid/delete-games", ['short_only' => true], $a['token']);
        $this->assertSame(0, $r->body['deleted']);
        $r = $this->call('POST', "/admin/groups/$gid/delete-games", ['short_only' => false], $a['token']);
        $this->assertSame(1, $r->body['deleted']);
        $this->assertSame(404, $this->call('POST', '/admin/groups/9999/delete-games', ['short_only' => false], $a['token'])->status);
    }

    public function test_export_contains_no_password_or_token_hashes(): void
    {
        $a = $this->admin();
        $tim = $this->makeUser('tim');
        $gid = Groups::create($this->pdo(), 'Vrienden', $tim['id'], 15);
        $this->addGame($gid, $tim['id'], $this->game(self::G1, 'Tim', 'Rav'));
        $r = $this->call('GET', '/admin/export', null, $a['token']);
        $this->assertSame(200, $r->status);
        foreach (['users', 'groups', 'players', 'games', 'sync_requests'] as $k) {
            $this->assertArrayHasKey($k, $r->body);
        }
        $this->assertCount(2, $r->body['users']);
        $this->assertCount(2, $r->body['games'][0]['players']);
        $json = json_encode($r->body);
        $this->assertStringNotContainsString('password_hash', $json);
        $this->assertStringNotContainsString('token_hash', $json);
        $this->assertStringNotContainsString('$2y$', $json);
        $this->assertStringNotContainsString($tim['token'], $json);
        $this->assertSame(403, $this->call('GET', '/admin/export', null, $tim['token'])->status);
    }
}
