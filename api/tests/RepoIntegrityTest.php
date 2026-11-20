<?php
declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

/** Transaction and error handling of the Groups repository writes. */
final class RepoIntegrityTest extends TestCase
{
    private const U1 = '11111111-1111-4111-8111-111111111111';

    private function game(string $id): array
    {
        return [
            'id' => $id, 'started_at' => '2026-11-18T21:04:05+01:00', 'duration_ms' => 600000,
            'max_penalty_points' => 15, 'ended_early' => false, 'winner' => 'Ravi',
            'players' => [
                ['name' => 'Tim', 'final_score' => 15, 'boer_count' => 1],
                ['name' => 'Ravi', 'final_score' => 5, 'boer_count' => 0],
            ],
        ];
    }

    private function rows(string $table): int
    {
        return (int)$this->pdo()->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
    }

    public function test_create_group_rolls_back_when_membership_insert_fails(): void
    {
        $tim = $this->makeUser('tim');
        // Make the second insert fail (DDL before the call, so it cannot commit the transaction under test).
        $this->pdo()->exec('DROP TABLE group_members');
        try {
            Groups::create($this->pdo(), 'Werk', $tim['id'], 15);
            $this->fail('expected the membership insert to fail');
        } catch (PDOException) {
        }
        $this->assertFalse($this->pdo()->inTransaction());
        $this->assertSame(0, $this->rows('game_groups'));
    }

    public function test_create_group_joins_an_outer_transaction(): void
    {
        $tim = $this->makeUser('tim');
        $this->pdo()->beginTransaction();
        Groups::create($this->pdo(), 'Werk', $tim['id'], 15);
        $this->assertTrue($this->pdo()->inTransaction(), 'create must not commit the outer transaction');
        $this->pdo()->rollBack();
        $this->assertSame(0, $this->rows('game_groups'));
        $this->assertSame(0, $this->rows('group_members'));
    }

    public function test_insert_game_reports_other_errors_instead_of_a_duplicate(): void
    {
        $tim = $this->makeUser('tim');
        // Unknown group: a foreign key failure, which INSERT IGNORE would have hidden as "already stored".
        $this->expectException(PDOException::class);
        Groups::insertGame($this->pdo(), 999999, $tim['id'], $this->game(self::U1));
    }

    public function test_insert_game_duplicate_returns_false_and_keeps_outer_transaction(): void
    {
        $tim = $this->makeUser('tim');
        $g = Groups::create($this->pdo(), 'Werk', $tim['id'], 15);
        $this->assertTrue(Groups::insertGame($this->pdo(), $g, $tim['id'], $this->game(self::U1)));

        $this->pdo()->beginTransaction();
        $this->assertFalse(Groups::insertGame($this->pdo(), $g, $tim['id'], $this->game(self::U1)));
        $this->assertTrue($this->pdo()->inTransaction(), 'a duplicate must leave the outer transaction open');
        $this->pdo()->commit();

        $this->assertSame(1, $this->rows('games'));
        $this->assertSame(2, $this->rows('game_players'));
    }
}
