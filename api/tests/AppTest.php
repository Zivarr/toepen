<?php
declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

final class AppTest extends TestCase
{
    public function test_unknown_route_returns_404_json(): void
    {
        $r = $this->call('GET', '/nope');
        $this->assertSame(404, $r->status);
        $this->assertSame('not_found', $r->body['error']);
    }

    public function test_unexpected_exception_returns_500_without_details(): void
    {
        App::$extraRoutes = [['GET', '/boom', fn() => throw new RuntimeException('secret'), 'none']];
        $prev = ini_set('error_log', '/dev/null');
        try {
            $r = $this->call('GET', '/boom');
        } finally {
            ini_set('error_log', $prev === false ? '' : $prev);
        }
        $this->assertSame(500, $r->status);
        $this->assertSame('server_error', $r->body['error']);
        $this->assertStringNotContainsString('secret', json_encode($r->body));
    }

    public function test_route_params_are_extracted(): void
    {
        App::$extraRoutes = [['GET', '/x/{id}', fn($rq, $c, $p) => new Response(200, ['id' => $p['id']]), 'none']];
        $this->assertSame('42', $this->call('GET', '/x/42')->body['id']);
    }

    public function test_wrong_method_returns_405(): void
    {
        App::$extraRoutes = [['GET', '/only-get', fn() => new Response(200, []), 'none']];
        $r = $this->call('POST', '/only-get');
        $this->assertSame(405, $r->status);
        $this->assertSame('method_not_allowed', $r->body['error']);
    }

    public function test_api_error_becomes_response_with_extra_fields(): void
    {
        App::$extraRoutes = [['GET', '/e', fn() => throw new ApiError(409, 'name_taken', 'Bezet', ['player' => ['id' => 1]]), 'none']];
        $r = $this->call('GET', '/e');
        $this->assertSame(409, $r->status);
        $this->assertSame('name_taken', $r->body['error']);
        $this->assertSame(1, $r->body['player']['id']);
    }

    public function test_request_header_lookup_is_case_insensitive(): void
    {
        $req = new Request('GET', '/', ['X-Auth-Token' => 'abc']);
        $this->assertSame('abc', $req->header('x-auth-token'));
        $this->assertNull($req->header('missing'));
    }

    public function test_schema_has_all_tables(): void
    {
        $tables = $this->pdo()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        foreach (['users', 'auth_tokens', 'login_attempts', 'game_groups', 'group_members', 'players', 'games', 'game_players', 'sync_requests'] as $t) {
            $this->assertContains($t, $tables);
        }
    }
}
