<?php
declare(strict_types=1);

final class AuthTest extends TestCase
{
    private function login(string $u, string $p): Response
    {
        return $this->call('POST', '/login', ['username' => $u, 'password' => $p, 'device_name' => 'test']);
    }

    public function test_login_returns_token_and_user(): void
    {
        $u = $this->makeUser('tim');
        $res = $this->login('tim', 'geheim123');
        $this->assertSame(200, $res->status);
        $this->assertSame(64, strlen($res->body['token']));
        $this->assertSame('tim', $res->body['user']['username']);
        $this->assertFalse($res->body['user']['is_admin']);
        $this->assertSame($u['id'], $res->body['user']['id']);
    }

    public function test_login_wrong_password_is_401(): void
    {
        $this->makeUser('tim');
        $res = $this->login('tim', 'fout');
        $this->assertSame(401, $res->status);
        $this->assertSame('invalid_credentials', $res->body['error']);
    }

    public function test_login_unknown_user_is_401_same_message(): void
    {
        $this->makeUser('tim');
        $a = $this->login('tim', 'fout');
        $b = $this->login('niemand', 'fout');
        $this->assertSame(401, $b->status);
        $this->assertSame($a->body, $b->body);
    }

    public function test_sixth_failed_login_within_15_minutes_is_429(): void
    {
        $this->makeUser('tim');
        for ($i = 0; $i < 5; $i++) {
            $this->assertSame(401, $this->login('tim', 'fout')->status);
        }
        $res = $this->login('tim', 'geheim123');
        $this->assertSame(429, $res->status);
        $this->assertSame('too_many_attempts', $res->body['error']);
    }

    public function test_failures_older_than_15_minutes_do_not_count(): void
    {
        $this->makeUser('tim');
        for ($i = 0; $i < 5; $i++) {
            $this->pdo()->exec("INSERT INTO login_attempts (username, attempted_at) VALUES ('tim', NOW() - INTERVAL 16 MINUTE)");
        }
        $this->assertSame(200, $this->login('tim', 'geheim123')->status);
    }

    public function test_disabled_user_cannot_login(): void
    {
        $u = $this->makeUser('tim');
        $this->pdo()->exec("UPDATE users SET disabled_at = NOW() WHERE id = {$u['id']}");
        $res = $this->login('tim', 'geheim123');
        $this->assertSame(401, $res->status);
        $this->assertSame('invalid_credentials', $res->body['error']);
    }

    public function test_login_username_is_case_insensitive(): void
    {
        $this->makeUser('tim');
        $this->assertSame(200, $this->login('TIM', 'geheim123')->status);
    }

    public function test_me_with_bearer_token(): void
    {
        $this->makeUser('tim');
        $u = $this->makeUser('anna');
        $res = $this->call('GET', '/me', null, $u['token']);
        $this->assertSame(200, $res->status);
        $this->assertSame('anna', $res->body['user']['username']);
    }

    public function test_me_without_token_is_401(): void
    {
        $res = $this->call('GET', '/me');
        $this->assertSame(401, $res->status);
        $this->assertSame('unauthorized', $res->body['error']);
        $this->assertSame('Log opnieuw in.', $res->body['message']);
    }

    public function test_token_accepted_via_x_auth_token_header(): void
    {
        $u = $this->makeUser('tim');
        $res = $this->call('GET', '/me', null, null, ['X-Auth-Token' => $u['token']]);
        $this->assertSame(200, $res->status);
    }

    public function test_logout_revokes_only_current_token(): void
    {
        $a = $this->makeUser('tim');
        $bToken = Auth::issueToken($this->pdo(), $a['id'], 'ander');
        $this->assertSame(204, $this->call('POST', '/logout', null, $a['token'])->status);
        $this->assertSame(401, $this->call('GET', '/me', null, $a['token'])->status);
        $this->assertSame(200, $this->call('GET', '/me', null, $bToken)->status);
    }

    public function test_disabled_user_token_rejected(): void
    {
        $u = $this->makeUser('tim');
        $this->assertSame(200, $this->call('GET', '/me', null, $u['token'])->status);
        $this->pdo()->exec("UPDATE users SET disabled_at = NOW() WHERE id = {$u['id']}");
        $this->assertSame(401, $this->call('GET', '/me', null, $u['token'])->status);
    }

    public function test_non_admin_on_admin_route_is_403(): void
    {
        App::$extraRoutes[] = ['GET', '/admin/users', fn($req, $ctx, $p) => new Response(200, []), 'admin'];
        $u = $this->makeUser('tim');
        $res = $this->call('GET', '/admin/users', null, $u['token']);
        $this->assertSame(403, $res->status);
        $this->assertSame('admin_only', $res->body['error']);
        $adm = $this->makeUser('baas', true);
        $this->assertSame(200, $this->call('GET', '/admin/users', null, $adm['token'])->status);
    }

    public function test_install_refuses_when_users_exist(): void
    {
        $this->makeUser('tim');
        $this->assertFalse(Install::run($this->pdo(), 'x', 'yyyyyyyy'));
        $this->assertSame(1, (int)$this->pdo()->query('SELECT COUNT(*) FROM users')->fetchColumn());
    }

    public function test_install_creates_admin_when_empty(): void
    {
        $this->assertTrue(Install::run($this->pdo(), 'baas', 'wachtwoord1'));
        $row = $this->pdo()->query("SELECT * FROM users WHERE username='baas'")->fetch();
        $this->assertSame(1, (int)$row['is_admin']);
        $this->assertTrue(password_verify('wachtwoord1', $row['password_hash']));
    }
}
