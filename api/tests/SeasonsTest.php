<?php
declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

final class SeasonsTest extends TestCase
{
    private function group(int $creator, string $name = 'Werk'): int
    {
        return Groups::create($this->pdo(), $name, $creator, 15);
    }

    private function admin(): array
    {
        return $this->makeUser('admin', true);
    }

    private function iso(string $modify): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->modify($modify)->format('Y-m-d\TH:i:sP');
    }

    /** @return array<int,array{id:int,name:?string,starts_at:string}> */
    private function seasons(int $gid): array
    {
        return Seasons::state($this->pdo(), $gid)['seasons'];
    }

    public function test_new_group_has_empty_season_state(): void
    {
        $tim = $this->makeUser('tim');
        $g = $this->group($tim['id']);
        $r = $this->call('GET', '/groups', null, $tim['token']);
        $this->assertSame(200, $r->status);
        $this->assertArrayHasKey('first_season_name', $r->body['groups'][0]);
        $this->assertNull($r->body['groups'][0]['first_season_name']);
        $this->assertSame([], $r->body['groups'][0]['seasons']);
        $this->assertSame(['first_season_name' => null, 'seasons' => []], Seasons::state($this->pdo(), $g));
    }

    public function test_start_season_defaults_to_now_and_shows_in_groups(): void
    {
        $a = $this->admin();
        $g = $this->group($a['id']);
        $r = $this->call('POST', "/admin/groups/$g/seasons", [], $a['token']);
        $this->assertSame(201, $r->status);
        $this->assertNull($r->body['first_season_name']);
        $this->assertCount(1, $r->body['seasons']);
        $s = $r->body['seasons'][0];
        $this->assertNull($s['name']);
        $this->assertIsInt($s['id']);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/', $s['starts_at']);
        $this->assertLessThan(10, abs(time() - strtotime($s['starts_at'])));

        $list = $this->call('GET', '/groups', null, $a['token']);
        $this->assertSame($r->body['seasons'], $list->body['groups'][0]['seasons']);
    }

    public function test_start_season_with_backdated_start_and_name(): void
    {
        $a = $this->admin();
        $g = $this->group($a['id']);
        $r = $this->call('POST', "/admin/groups/$g/seasons", ['name' => '  Winter  ', 'starts_at' => '2026-01-05T10:00:00+01:00'], $a['token']);
        $this->assertSame(201, $r->status);
        $this->assertSame('Winter', $r->body['seasons'][0]['name']);
        $this->assertSame('2026-01-05T09:00:00+00:00', $r->body['seasons'][0]['starts_at']);
    }

    public function test_start_season_before_latest_is_422(): void
    {
        $a = $this->admin();
        $g = $this->group($a['id']);
        $this->call('POST', "/admin/groups/$g/seasons", ['starts_at' => '2026-03-01T10:00:00+00:00'], $a['token']);
        foreach (['2026-02-01T10:00:00+00:00', '2026-03-01T10:00:00+00:00'] as $at) {
            $r = $this->call('POST', "/admin/groups/$g/seasons", ['starts_at' => $at], $a['token']);
            $this->assertSame(422, $r->status);
            $this->assertSame('validation_failed', $r->body['error']);
        }
        $this->assertCount(1, $this->seasons($g));
    }

    public function test_start_in_future_is_422(): void
    {
        $a = $this->admin();
        $g = $this->group($a['id']);
        $r = $this->call('POST', "/admin/groups/$g/seasons", ['starts_at' => $this->iso('+1 hour')], $a['token']);
        $this->assertSame(422, $r->status);
        $this->assertSame([], $this->seasons($g));
        $ok = $this->call('POST', "/admin/groups/$g/seasons", ['starts_at' => $this->iso('+2 minutes')], $a['token']);
        $this->assertSame(201, $ok->status);
    }

    public function test_invalid_start_format_is_422(): void
    {
        $a = $this->admin();
        $g = $this->group($a['id']);
        foreach (['2026-01-05', 'gisteren', 5] as $bad) {
            $r = $this->call('POST', "/admin/groups/$g/seasons", ['starts_at' => $bad], $a['token']);
            $this->assertSame(422, $r->status);
        }
    }

    public function test_patch_rename_and_reset_name(): void
    {
        $a = $this->admin();
        $g = $this->group($a['id']);
        $id = $this->call('POST', "/admin/groups/$g/seasons", ['name' => 'Oud'], $a['token'])->body['seasons'][0]['id'];
        $r = $this->call('PATCH', "/admin/seasons/$id", ['name' => ' Zomer '], $a['token']);
        $this->assertSame(200, $r->status);
        $this->assertSame('Zomer', $r->body['seasons'][0]['name']);
        $r = $this->call('PATCH', "/admin/seasons/$id", ['name' => ''], $a['token']);
        $this->assertNull($r->body['seasons'][0]['name']);
        $this->call('PATCH', "/admin/seasons/$id", ['name' => 'Weer'], $a['token']);
        $r = $this->call('PATCH', "/admin/seasons/$id", ['name' => null], $a['token']);
        $this->assertNull($r->body['seasons'][0]['name']);
    }

    public function test_patch_start_must_stay_between_neighbours(): void
    {
        $a = $this->admin();
        $g = $this->group($a['id']);
        foreach (['2026-01-01T00:00:00+00:00', '2026-02-01T00:00:00+00:00', '2026-03-01T00:00:00+00:00'] as $at) {
            $this->call('POST', "/admin/groups/$g/seasons", ['starts_at' => $at], $a['token']);
        }
        $before = $this->seasons($g);
        $mid = $before[1]['id'];
        foreach (['2025-12-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00', '2026-03-01T00:00:00+00:00', '2026-04-01T00:00:00+00:00'] as $bad) {
            $r = $this->call('PATCH', "/admin/seasons/$mid", ['starts_at' => $bad], $a['token']);
            $this->assertSame(422, $r->status, $bad);
        }
        $this->assertSame($before, $this->seasons($g));

        $r = $this->call('PATCH', "/admin/seasons/$mid", ['starts_at' => '2026-02-15T00:00:00+00:00'], $a['token']);
        $this->assertSame(200, $r->status);
        $this->assertSame('2026-02-15T00:00:00+00:00', $r->body['seasons'][1]['starts_at']);
        // The first and last season have one neighbour only.
        $last = $before[2]['id'];
        $this->assertSame(422, $this->call('PATCH', "/admin/seasons/$last", ['starts_at' => '2026-02-01T00:00:00+00:00'], $a['token'])->status);
        $this->assertSame(200, $this->call('PATCH', "/admin/seasons/{$before[0]['id']}", ['starts_at' => '2025-06-01T00:00:00+00:00'], $a['token'])->status);
    }

    public function test_patch_start_in_future_is_422(): void
    {
        $a = $this->admin();
        $g = $this->group($a['id']);
        $id = $this->call('POST', "/admin/groups/$g/seasons", [], $a['token'])->body['seasons'][0]['id'];
        $r = $this->call('PATCH', "/admin/seasons/$id", ['starts_at' => $this->iso('+1 day')], $a['token']);
        $this->assertSame(422, $r->status);
    }

    public function test_delete_season(): void
    {
        $a = $this->admin();
        $g = $this->group($a['id']);
        $this->call('POST', "/admin/groups/$g/seasons", ['starts_at' => '2026-01-01T00:00:00+00:00'], $a['token']);
        $s = $this->call('POST', "/admin/groups/$g/seasons", ['starts_at' => '2026-02-01T00:00:00+00:00'], $a['token'])->body['seasons'];
        $r = $this->call('DELETE', "/admin/seasons/{$s[0]['id']}", null, $a['token']);
        $this->assertSame(200, $r->status);
        $this->assertCount(1, $r->body['seasons']);
        $this->assertSame($s[1]['id'], $r->body['seasons'][0]['id']);
        $this->assertSame(404, $this->call('DELETE', "/admin/seasons/{$s[0]['id']}", null, $a['token'])->status);
    }

    public function test_rename_first_season(): void
    {
        $a = $this->admin();
        $g = $this->group($a['id']);
        $r = $this->call('PATCH', "/admin/groups/$g/first-season", ['name' => ' Begin '], $a['token']);
        $this->assertSame(200, $r->status);
        $this->assertSame('Begin', $r->body['first_season_name']);
        $this->assertSame([], $r->body['seasons']);
        $r = $this->call('PATCH', "/admin/groups/$g/first-season", ['name' => ''], $a['token']);
        $this->assertNull($r->body['first_season_name']);
        $this->assertSame(404, $this->call('PATCH', '/admin/groups/9999/first-season', ['name' => 'x'], $a['token'])->status);
        $this->assertSame(422, $this->call('PATCH', "/admin/groups/$g/first-season", ['name' => 5], $a['token'])->status);
    }

    public function test_name_longer_than_40_is_422(): void
    {
        $a = $this->admin();
        $g = $this->group($a['id']);
        $long = str_repeat('é', 41);
        $this->assertSame(422, $this->call('POST', "/admin/groups/$g/seasons", ['name' => $long], $a['token'])->status);
        $this->assertSame(422, $this->call('PATCH', "/admin/groups/$g/first-season", ['name' => $long], $a['token'])->status);
        $id = $this->call('POST', "/admin/groups/$g/seasons", [], $a['token'])->body['seasons'][0]['id'];
        $this->assertSame(422, $this->call('PATCH', "/admin/seasons/$id", ['name' => $long], $a['token'])->status);
        $ok = $this->call('PATCH', "/admin/seasons/$id", ['name' => str_repeat('é', 40)], $a['token']);
        $this->assertSame(200, $ok->status);
    }

    public function test_member_cannot_manage_seasons_403(): void
    {
        $tim = $this->makeUser('tim');
        $g = $this->group($tim['id']);
        $a = $this->admin();
        $id = $this->call('POST', "/admin/groups/$g/seasons", [], $a['token'])->body['seasons'][0]['id'];
        $this->assertSame(403, $this->call('POST', "/admin/groups/$g/seasons", [], $tim['token'])->status);
        $this->assertSame(403, $this->call('PATCH', "/admin/seasons/$id", ['name' => 'x'], $tim['token'])->status);
        $this->assertSame(403, $this->call('DELETE', "/admin/seasons/$id", null, $tim['token'])->status);
        $this->assertSame(403, $this->call('PATCH', "/admin/groups/$g/first-season", ['name' => 'x'], $tim['token'])->status);
        $this->assertCount(1, $this->seasons($g));
    }

    public function test_unknown_season_404(): void
    {
        $a = $this->admin();
        $this->assertSame(404, $this->call('PATCH', '/admin/seasons/9999', ['name' => 'x'], $a['token'])->status);
        $this->assertSame(404, $this->call('DELETE', '/admin/seasons/9999', null, $a['token'])->status);
        $this->assertSame(404, $this->call('POST', '/admin/groups/9999/seasons', [], $a['token'])->status);
    }

    public function test_admin_groups_list_includes_season_state(): void
    {
        $a = $this->admin();
        $g = $this->group($a['id']);
        $this->call('PATCH', "/admin/groups/$g/first-season", ['name' => 'Begin'], $a['token']);
        $this->call('POST', "/admin/groups/$g/seasons", ['name' => 'Twee'], $a['token']);
        $r = $this->call('GET', '/admin/groups', null, $a['token']);
        $this->assertSame(200, $r->status);
        $grp = $r->body['groups'][0];
        $this->assertSame('Begin', $grp['first_season_name']);
        $this->assertCount(1, $grp['seasons']);
        $this->assertSame('Twee', $grp['seasons'][0]['name']);
    }

    public function test_merge_groups_drops_source_seasons(): void
    {
        $a = $this->admin();
        $src = $this->group($a['id'], 'Bron');
        $dst = $this->group($a['id'], 'Doel');
        $this->call('POST', "/admin/groups/$src/seasons", [], $a['token']);
        $this->call('POST', "/admin/groups/$dst/seasons", ['name' => 'Blijft'], $a['token']);
        $r = $this->call('POST', '/admin/groups/merge', ['source_group_id' => $src, 'target_group_id' => $dst], $a['token']);
        $this->assertSame(200, $r->status);
        $this->assertSame(0, (int)$this->pdo()->query("SELECT COUNT(*) FROM seasons WHERE group_id = $src")->fetchColumn());
        $this->assertSame('Blijft', $r->body['group']['seasons'][0]['name']);
        $this->assertCount(1, $r->body['group']['seasons']);
    }
}
