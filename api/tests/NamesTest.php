<?php
declare(strict_types=1);

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class NamesTest extends TestCase
{
    public static function similarProvider(): array
    {
        return [
            'prefix, 3 chars'            => ['Rav', 'Ravi', true],
            'prefix with suffix word'    => ['Ravi', 'Ravi B', true],
            'equal is exact not similar' => ['Ravi', 'ravi', false],
            'one substitution, short'    => ['Tim', 'Tom', true],
            'one substitution, short 2'  => ['Tim', 'Kim', true],
            'prefix below 3 chars'       => ['Jo', 'Joost', false],
            'one substitution 5 chars'   => ['Sanne', 'Sanna', true],
            'one edit, 8 chars'          => ['Mohammed', 'Mohamed', true],
            'too short for prefix'       => ['Mohammed', 'Mo', false],
            'two edits'                  => ['Kees', 'Klaas', false],
        ];
    }

    #[DataProvider('similarProvider')]
    public function test_is_similar(string $a, string $b, bool $expected): void
    {
        $this->assertSame($expected, Names::isSimilar($a, $b));
        $this->assertSame($expected, Names::isSimilar($b, $a));
    }

    public static function normaliseProvider(): array
    {
        return [
            'trim and lowercase'     => ['  Ravi ', 'ravi'],
            'collapse spaces'        => ["Ravi \t  B", 'ravi b'],
            'accented lowercase'     => ['ÉVA', 'éva'],
        ];
    }

    #[DataProvider('normaliseProvider')]
    public function test_normalise(string $input, string $expected): void
    {
        $this->assertSame($expected, Names::normalise($input));
    }

    public static function titleCaseProvider(): array
    {
        return [
            'trim and first upper'   => ['  ravi ', 'Ravi'],
            'multibyte first char'   => ['éva', 'Éva'],
            'collapse, keep rest'    => ['tim  w', 'Tim w'],
        ];
    }

    #[DataProvider('titleCaseProvider')]
    public function test_title_case(string $input, string $expected): void
    {
        $this->assertSame($expected, Names::titleCase($input));
    }

    private function player(int $id, string $name): array
    {
        return ['id' => $id, 'name' => $name, 'games_played' => 0];
    }

    public function test_find_match_exact(): void
    {
        $ravi = $this->player(1, 'Ravi');
        $this->assertSame(
            ['match' => 'exact', 'player_id' => 1, 'suggestions' => []],
            Names::findMatch('ravi', [$ravi])
        );
    }

    public function test_find_match_similar(): void
    {
        $ravi = $this->player(1, 'Ravi');
        $kees = $this->player(2, 'Kees');
        $this->assertSame(
            ['match' => 'similar', 'player_id' => null, 'suggestions' => [$ravi]],
            Names::findMatch('Rav', [$ravi, $kees])
        );
    }

    public function test_find_match_new(): void
    {
        $this->assertSame(
            ['match' => 'new', 'player_id' => null, 'suggestions' => []],
            Names::findMatch('Piet', [$this->player(1, 'Ravi')])
        );
    }
}
