<?php
declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

/** Player names that differ only by accents (José/Jose, ß/ss) are different players, like everywhere else in the app. */
final class PlayerNameAccentTest extends TestCase
{
    private const U1 = '3f2b8c1e-5d4a-4e7b-9a10-1c2d3e4f5a6b';

    private function game(string $id, string $a, string $b, ?int $groupId = null): array
    {
        $g = [
            'id' => $id, 'started_at' => '2026-11-18T21:04:05+01:00', 'duration_ms' => 600000,
            'max_penalty_points' => 10, 'ended_early' => false, 'winner' => $b,
            'players' => [
                ['name' => $a, 'final_score' => 10, 'boer_count' => 0],
                ['name' => $b, 'final_score' => 3, 'boer_count' => 0],
            ],
        ];
        if ($groupId !== null) {
            $g['group_id'] = $groupId;
        }
        return $g;
    }

    private function playerNames(int $groupId): array
    {
        $st = $this->pdo()->prepare('SELECT name FROM players WHERE group_id = ? ORDER BY id');
        $st->execute([$groupId]);
        return $st->fetchAll(PDO::FETCH_COLUMN);
    }

    public function test_approving_a_game_with_jose_and_jose_accented_succeeds(): void
    {
        $tim = $this->makeUser('tim');
        $admin = $this->makeUser('admin', true);
        $r = $this->call('POST', '/sync-requests', [
            'source' => 'android', 'group_name' => 'Vrienden', 'games' => [$this->game(self::U1, 'José', 'Jose')],
        ], $tim['token']);
        $this->assertSame(201, $r->status);
        $id = $r->body['request']['id'];

        $approve = $this->call('POST', "/admin/sync-requests/$id/approve", ['mode' => 'new'], $admin['token']);
        $this->assertSame(200, $approve->status);
        $groupId = $approve->body['request']['resolved_group_id'];
        $this->assertEqualsCanonicalizing(['José', 'Jose'], $this->playerNames($groupId));
    }

    public function test_upload_with_jose_and_jose_accented_stores_two_players(): void
    {
        $tim = $this->makeUser('tim');
        $g = Groups::create($this->pdo(), 'Werk', $tim['id'], 10);
        $r = $this->call('POST', '/games', $this->game(self::U1, 'José', 'Jose', $g), $tim['token']);
        $this->assertSame(201, $r->status);
        $this->assertEqualsCanonicalizing(['José', 'Jose'], $this->playerNames($g));
    }

    public function test_eszett_and_ss_are_different_players(): void
    {
        $tim = $this->makeUser('tim');
        $g = Groups::create($this->pdo(), 'Werk', $tim['id'], 10);
        $this->assertNotSame(
            Groups::resolvePlayer($this->pdo(), $g, 'Strauß'),
            Groups::resolvePlayer($this->pdo(), $g, 'Strauss')
        );
    }

    public function test_names_still_match_case_insensitively(): void
    {
        $tim = $this->makeUser('tim');
        $g = Groups::create($this->pdo(), 'Werk', $tim['id'], 10);
        $this->assertSame(
            Groups::resolvePlayer($this->pdo(), $g, 'José'),
            Groups::resolvePlayer($this->pdo(), $g, 'josé')
        );
    }
}
