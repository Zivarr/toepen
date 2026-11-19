<?php
declare(strict_types=1);

final class PasswordLinkTest extends TestCase
{
    private function admin(): array
    {
        return $this->makeUser('beheer', true);
    }

    private function passwordHash(int $userId): ?string
    {
        $st = $this->pdo()->prepare('SELECT password_hash FROM users WHERE id = ?');
        $st->execute([$userId]);
        return $st->fetchColumn() ?: null;
    }

    // ---- Task 1: admin side ---------------------------------------------------------------------

    public function test_create_user_without_password_returns_invite_link(): void
    {
        $admin = $this->admin();
        $res = $this->call('POST', '/admin/users', ['username' => 'kees', 'is_admin' => false], $admin['token']);
        $this->assertSame(201, $res->status);
        $link = $res->body['link'];
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $link['code']);
        $this->assertSame('invite', $link['purpose']);
        $expires = strtotime($link['expires_at']);
        $this->assertEqualsWithDelta(time() + 48 * 3600, $expires, 120);
        $this->assertNull($this->passwordHash($res->body['user']['id']));
    }

    public function test_create_user_with_empty_password_returns_link(): void
    {
        $admin = $this->admin();
        $res = $this->call('POST', '/admin/users', ['username' => 'kees', 'password' => '', 'is_admin' => false], $admin['token']);
        $this->assertSame(201, $res->status);
        $this->assertSame('invite', $res->body['link']['purpose']);
    }

    public function test_create_user_with_password_has_no_link(): void
    {
        $admin = $this->admin();
        $res = $this->call('POST', '/admin/users', ['username' => 'kees', 'password' => 'geheim123', 'is_admin' => false], $admin['token']);
        $this->assertSame(201, $res->status);
        $this->assertArrayNotHasKey('link', $res->body);
        $login = $this->call('POST', '/login', ['username' => 'kees', 'password' => 'geheim123', 'device_name' => 't']);
        $this->assertSame(200, $login->status);
    }

    public function test_password_link_for_user_without_password_is_invite(): void
    {
        $admin = $this->admin();
        $id = $this->call('POST', '/admin/users', ['username' => 'kees', 'is_admin' => false], $admin['token'])->body['user']['id'];
        $res = $this->call('POST', "/admin/users/$id/password-link", null, $admin['token']);
        $this->assertSame(201, $res->status);
        $this->assertSame('invite', $res->body['link']['purpose']);
    }

    public function test_password_link_for_user_with_password_is_reset(): void
    {
        $admin = $this->admin();
        $kees = $this->makeUser('kees');
        $res = $this->call('POST', "/admin/users/{$kees['id']}/password-link", null, $admin['token']);
        $this->assertSame(201, $res->status);
        $this->assertSame('reset', $res->body['link']['purpose']);
    }

    public function test_new_link_invalidates_older_unused_link(): void
    {
        $admin = $this->admin();
        $kees = $this->makeUser('kees');
        $old = $this->call('POST', "/admin/users/{$kees['id']}/password-link", null, $admin['token'])->body['link']['code'];
        $new = $this->call('POST', "/admin/users/{$kees['id']}/password-link", null, $admin['token'])->body['link']['code'];
        $this->assertNull(PasswordLinks::find($this->pdo(), $old));
        $this->assertNotNull(PasswordLinks::find($this->pdo(), $new));
    }

    public function test_only_hash_is_stored(): void
    {
        $admin = $this->admin();
        $kees = $this->makeUser('kees');
        $code = $this->call('POST', "/admin/users/{$kees['id']}/password-link", null, $admin['token'])->body['link']['code'];
        $hashes = $this->pdo()->query('SELECT token_hash FROM password_links')->fetchAll(PDO::FETCH_COLUMN);
        $this->assertSame([hash('sha256', $code)], $hashes);
    }

    public function test_list_users_shows_invite_pending(): void
    {
        $admin = $this->admin();
        $this->makeUser('anna');
        $this->call('POST', '/admin/users', ['username' => 'kees', 'is_admin' => false], $admin['token']);
        $users = $this->call('GET', '/admin/users', null, $admin['token'])->body['users'];
        $byName = array_column($users, 'invite_pending', 'username');
        $this->assertFalse($byName['anna']);
        $this->assertTrue($byName['kees']);
    }

    public function test_password_link_requires_admin(): void
    {
        $member = $this->makeUser('anna');
        $kees = $this->makeUser('kees');
        $res = $this->call('POST', "/admin/users/{$kees['id']}/password-link", null, $member['token']);
        $this->assertSame(403, $res->status);
    }

    // ---- Task 2: public side and own password ---------------------------------------------------

    /** Creates user kees without a password; returns [id, invite code]. */
    private function invited(): array
    {
        $admin = $this->admin();
        $res = $this->call('POST', '/admin/users', ['username' => 'kees', 'is_admin' => false], $admin['token']);
        return [$res->body['user']['id'], $res->body['link']['code']];
    }

    private function redeem(string $code, string $password = 'nieuwwacht'): Response
    {
        return $this->call('POST', "/password-links/$code", ['password' => $password, 'device_name' => 'iPhone']);
    }

    private function login(string $username, string $password): Response
    {
        return $this->call('POST', '/login', ['username' => $username, 'password' => $password, 'device_name' => 't']);
    }

    public function test_link_info_returns_username_and_purpose(): void
    {
        [, $code] = $this->invited();
        $res = $this->call('GET', "/password-links/$code");
        $this->assertSame(200, $res->status);
        $this->assertSame('kees', $res->body['username']);
        $this->assertSame('invite', $res->body['purpose']);
        $this->assertArrayHasKey('expires_at', $res->body);
    }

    public function test_redeem_invite_sets_password_and_logs_in(): void
    {
        [, $code] = $this->invited();
        $res = $this->redeem($code);
        $this->assertSame(200, $res->status);
        $this->assertSame('kees', $res->body['user']['username']);
        $this->assertSame(200, $this->call('GET', '/me', null, $res->body['token'])->status);
        $this->assertSame(200, $this->login('kees', 'nieuwwacht')->status);
    }

    public function test_link_cannot_be_used_twice(): void
    {
        [, $code] = $this->invited();
        $this->assertSame(200, $this->redeem($code)->status);
        $second = $this->redeem($code, 'anderwacht');
        $this->assertSame(404, $second->status);
        $this->assertSame('link_invalid', $second->body['error']);
        $this->assertSame(401, $this->login('kees', 'anderwacht')->status);
    }

    public function test_expired_link_rejected(): void
    {
        [, $code] = $this->invited();
        $this->pdo()->exec('UPDATE password_links SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE');
        $this->assertSame(404, $this->call('GET', "/password-links/$code")->status);
        $this->assertSame(404, $this->redeem($code)->status);
    }

    public function test_disabled_user_link_rejected(): void
    {
        [$id, $code] = $this->invited();
        $this->pdo()->prepare('UPDATE users SET disabled_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$id]);
        $this->assertSame(404, $this->call('GET', "/password-links/$code")->status);
        $this->assertSame(404, $this->redeem($code)->status);
    }

    public function test_short_password_keeps_link_usable(): void
    {
        [, $code] = $this->invited();
        $this->assertSame(422, $this->redeem($code, 'kort')->status);
        $this->assertSame(200, $this->redeem($code)->status);
    }

    public function test_reset_revokes_existing_tokens(): void
    {
        $admin = $this->admin();
        $kees = $this->makeUser('kees');
        $code = $this->call('POST', "/admin/users/{$kees['id']}/password-link", null, $admin['token'])->body['link']['code'];
        $res = $this->redeem($code);
        $this->assertSame(200, $res->status);
        $this->assertSame(401, $this->call('GET', '/me', null, $kees['token'])->status);
        $this->assertSame(200, $this->call('GET', '/me', null, $res->body['token'])->status);
    }

    public function test_invite_redeem_has_no_tokens_to_revoke_and_succeeds(): void
    {
        [$id, $code] = $this->invited();
        $this->assertSame(200, $this->redeem($code)->status);
        $st = $this->pdo()->prepare('SELECT COUNT(*) FROM auth_tokens WHERE user_id = ? AND revoked_at IS NULL');
        $st->execute([$id]);
        $this->assertSame(1, (int)$st->fetchColumn());
    }

    public function test_login_refused_while_password_not_set(): void
    {
        $this->invited();
        $res = $this->login('kees', 'watdanook');
        $this->assertSame(401, $res->status);
        $this->assertSame('invalid_credentials', $res->body['error']);
    }

    public function test_change_own_password(): void
    {
        $kees = $this->makeUser('kees');
        $res = $this->call('POST', '/me/password', ['current_password' => 'geheim123', 'new_password' => 'nieuwwacht'], $kees['token']);
        $this->assertSame(204, $res->status);
        $this->assertSame(401, $this->login('kees', 'geheim123')->status);
        $this->assertSame(200, $this->login('kees', 'nieuwwacht')->status);
        $this->assertSame(200, $this->call('GET', '/me', null, $kees['token'])->status);
    }

    public function test_change_own_password_wrong_current_is_403_and_counts(): void
    {
        $kees = $this->makeUser('kees');
        $res = $this->call('POST', '/me/password', ['current_password' => 'fout1234', 'new_password' => 'nieuwwacht'], $kees['token']);
        $this->assertSame(403, $res->status);
        $this->assertSame('wrong_password', $res->body['error']);
        $count = (int)$this->pdo()->query("SELECT COUNT(*) FROM login_attempts WHERE username = 'kees'")->fetchColumn();
        $this->assertSame(1, $count);
    }

    public function test_change_own_password_rate_limited(): void
    {
        $kees = $this->makeUser('kees');
        for ($i = 0; $i < 5; $i++) {
            $this->call('POST', '/me/password', ['current_password' => 'fout1234', 'new_password' => 'nieuwwacht'], $kees['token']);
        }
        $res = $this->call('POST', '/me/password', ['current_password' => 'geheim123', 'new_password' => 'nieuwwacht'], $kees['token']);
        $this->assertSame(429, $res->status);
    }

    public function test_password_link_unknown_user_404(): void
    {
        $admin = $this->admin();
        $res = $this->call('POST', '/admin/users/9999/password-link', null, $admin['token']);
        $this->assertSame(404, $res->status);
    }
}
