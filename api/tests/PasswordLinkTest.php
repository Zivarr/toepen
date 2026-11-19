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

    public function test_password_link_unknown_user_404(): void
    {
        $admin = $this->admin();
        $res = $this->call('POST', '/admin/users/9999/password-link', null, $admin['token']);
        $this->assertSame(404, $res->status);
    }
}
