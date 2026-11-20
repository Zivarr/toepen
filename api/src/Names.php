<?php
declare(strict_types=1);

/** Player-name normalisation and fuzzy matching. Rule shared with the PWA. */
final class Names
{
    /** Trim, lowercase, collapse whitespace. */
    public static function normalise(string $name): string
    {
        $collapsed = preg_replace('/\s+/u', ' ', trim($name)) ?? '';
        return mb_strtolower($collapsed, 'UTF-8');
    }

    /** Trim, collapse whitespace, uppercase the first character only. */
    public static function titleCase(string $name): string
    {
        $collapsed = preg_replace('/\s+/u', ' ', trim($name)) ?? '';
        if ($collapsed === '') {
            return '';
        }
        return mb_strtoupper(mb_substr($collapsed, 0, 1, 'UTF-8'), 'UTF-8')
            . mb_substr($collapsed, 1, null, 'UTF-8');
    }

    /** Two different normalised names are similar by prefix (shorter >= 3 chars) or small edit distance. */
    public static function isSimilar(string $a, string $b): bool
    {
        $na = self::normalise($a);
        $nb = self::normalise($b);
        if ($na === $nb) {
            return false;
        }

        [$short, $long] = mb_strlen($na, 'UTF-8') <= mb_strlen($nb, 'UTF-8') ? [$na, $nb] : [$nb, $na];
        $shortLen = mb_strlen($short, 'UTF-8');
        $longLen = mb_strlen($long, 'UTF-8');

        if ($shortLen >= 3 && mb_substr($long, 0, $shortLen, 'UTF-8') === $short) {
            return true;
        }

        $threshold = $longLen <= 5 ? 1 : 2;
        return self::editDistance($na, $nb) <= $threshold;
    }

    /**
     * Matches a name against existing players.
     *
     * @param array<int, array{id:int, name:string, games_played:int}> $players
     * @return array{match:string, player_id:?int, suggestions:array<int, array{id:int, name:string, games_played:int}>}
     */
    public static function findMatch(string $name, array $players): array
    {
        $normalised = self::normalise($name);
        $similar = [];

        foreach ($players as $player) {
            if (self::normalise($player['name']) === $normalised) {
                return ['match' => 'exact', 'player_id' => $player['id'], 'suggestions' => []];
            }
            if (self::isSimilar($name, $player['name'])) {
                $similar[] = $player;
            }
        }

        if ($similar !== []) {
            return ['match' => 'similar', 'player_id' => null, 'suggestions' => $similar];
        }
        return ['match' => 'new', 'player_id' => null, 'suggestions' => []];
    }

    /** Levenshtein distance over Unicode code points (PHP's levenshtein() is byte-based). */
    private static function editDistance(string $a, string $b): int
    {
        $s = preg_split('//u', $a, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $t = preg_split('//u', $b, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $m = count($s);
        $n = count($t);

        $prev = range(0, $n);
        for ($i = 1; $i <= $m; $i++) {
            $cur = [$i];
            for ($j = 1; $j <= $n; $j++) {
                $cost = $s[$i - 1] === $t[$j - 1] ? 0 : 1;
                $cur[$j] = min($prev[$j] + 1, $cur[$j - 1] + 1, $prev[$j - 1] + $cost);
            }
            $prev = $cur;
        }
        return $prev[$n];
    }
}
