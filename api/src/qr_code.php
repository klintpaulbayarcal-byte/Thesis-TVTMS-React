<?php
declare(strict_types=1);

/**
 * Dependency-free QR Code PNG generator for a canonical public citation URL.
 * QR Model 2, byte mode, error-correction level M, versions 1–10, mask 0.
 * Requires only PHP zlib; never contacts a third-party QR service.
 */
final class TicketQrCode
{
    private const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
    private const NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
    private const ALIGNMENT = [
        1 => [], 2 => [6, 18], 3 => [6, 22], 4 => [6, 26],
        5 => [6, 30], 6 => [6, 34], 7 => [6, 22, 38],
        8 => [6, 24, 42], 9 => [6, 26, 46], 10 => [6, 28, 50],
    ];

    private int $size;
    private int $version;
    private array $modules;
    private array $function;

    private function __construct(int $version)
    {
        $this->version = $version;
        $this->size = 4 * $version + 17;
        $this->modules = array_fill(0, $this->size, array_fill(0, $this->size, false));
        $this->function = array_fill(0, $this->size, array_fill(0, $this->size, false));
    }

    public static function png(string $url, int $scale = 6): string
    {
        if ($url === '' || !preg_match('~^https://[A-Za-z0-9.-]+(?::443)?/ticket-lookup\?ticket=(?:[A-Za-z0-9-]|%2F)+$~D', $url)) {
            throw new InvalidArgumentException('QR target must be an HTTPS citation lookup URL.');
        }
        if ($scale < 4 || $scale > 8) throw new InvalidArgumentException('Unsupported QR scale.');

        $length = strlen($url);
        $chosen = null;
        for ($v = 1; $v <= 10; $v++) {
            $capacity = intdiv(self::rawModules($v), 8) - self::ECC_PER_BLOCK[$v] * self::NUM_BLOCKS[$v];
            $requiredBits = 4 + ($v <= 9 ? 8 : 16) + $length * 8;
            if ($requiredBits <= $capacity * 8) { $chosen = $v; break; }
        }
        if ($chosen === null) throw new InvalidArgumentException('Citation URL is too long for QR encoding.');
        $qr = new self($chosen);
        $data = $qr->encodeData($url);
        $qr->drawFunctions();
        $qr->drawCodewords($data);
        $qr->applyMaskZero();
        $qr->drawFormatZero();
        return $qr->toPng($scale);
    }

    private static function rawModules(int $v): int
    {
        $result = (16 * $v + 128) * $v + 64;
        if ($v >= 2) {
            $align = intdiv($v, 7) + 2;
            $result -= (25 * $align - 10) * $align - 55;
            if ($v >= 7) $result -= 36;
        }
        return $result;
    }

    private static function appendBits(array &$buffer, int $value, int $length): void
    {
        for ($i = $length - 1; $i >= 0; $i--) $buffer[] = (($value >> $i) & 1) !== 0;
    }

    private function encodeData(string $url): array
    {
        $v = $this->version;
        $capacity = intdiv(self::rawModules($v), 8) - self::ECC_PER_BLOCK[$v] * self::NUM_BLOCKS[$v];
        $bits = [];
        self::appendBits($bits, 4, 4);
        self::appendBits($bits, strlen($url), $v <= 9 ? 8 : 16);
        for ($i = 0; $i < strlen($url); $i++) self::appendBits($bits, ord($url[$i]), 8);
        self::appendBits($bits, 0, min(4, $capacity * 8 - count($bits)));
        while (count($bits) % 8 !== 0) $bits[] = false;
        $data = [];
        for ($i = 0; $i < count($bits); $i += 8) {
            $byte = 0;
            for ($j = 0; $j < 8; $j++) $byte = ($byte << 1) | ($bits[$i + $j] ? 1 : 0);
            $data[] = $byte;
        }
        while (count($data) < $capacity) $data[] = count($data) % 2 === 0 ? 0xEC : 0x11;

        $eccCount = self::ECC_PER_BLOCK[$v];
        $blocks = self::NUM_BLOCKS[$v];
        $rawBytes = intdiv(self::rawModules($v), 8);
        $shortBlocks = $blocks - ($rawBytes % $blocks);
        $shortDataLen = intdiv($rawBytes, $blocks) - $eccCount;
        $split = [];
        $offset = 0;
        $divisor = self::rsDivisor($eccCount);
        for ($i = 0; $i < $blocks; $i++) {
            $n = $shortDataLen + ($i >= $shortBlocks ? 1 : 0);
            $chunk = array_slice($data, $offset, $n);
            $offset += $n;
            $split[] = ['data' => $chunk, 'ecc' => self::rsRemainder($chunk, $divisor)];
        }
        $interleaved = [];
        for ($i = 0; $i <= $shortDataLen; $i++) {
            foreach ($split as $block) {
                if (isset($block['data'][$i])) $interleaved[] = $block['data'][$i];
            }
        }
        for ($i = 0; $i < $eccCount; $i++) {
            foreach ($split as $block) $interleaved[] = $block['ecc'][$i];
        }
        if (count($interleaved) !== $rawBytes) throw new LogicException('QR codeword count mismatch.');
        return $interleaved;
    }

    private static function gfMul(int $x, int $y): int
    {
        $z = 0;
        for ($i = 7; $i >= 0; $i--) {
            $z = (($z << 1) ^ ((($z >> 7) & 1) * 0x11D));
            $z ^= ((($y >> $i) & 1) * $x);
        }
        return $z;
    }

    private static function rsDivisor(int $degree): array
    {
        $r = array_fill(0, $degree, 0);
        $r[$degree - 1] = 1;
        $root = 1;
        for ($i = 0; $i < $degree; $i++) {
            for ($j = 0; $j < $degree; $j++) {
                $r[$j] = self::gfMul($r[$j], $root);
                if ($j + 1 < $degree) $r[$j] ^= $r[$j + 1];
            }
            $root = self::gfMul($root, 2);
        }
        return $r;
    }

    private static function rsRemainder(array $data, array $divisor): array
    {
        $result = array_fill(0, count($divisor), 0);
        foreach ($data as $byte) {
            $factor = $byte ^ array_shift($result);
            $result[] = 0;
            foreach ($divisor as $i => $coefficient) $result[$i] ^= self::gfMul($coefficient, $factor);
        }
        return $result;
    }

    private function setFunction(int $x, int $y, bool $black): void
    {
        $this->modules[$y][$x] = $black;
        $this->function[$y][$x] = true;
    }

    private function drawFinder(int $x, int $y): void
    {
        for ($dy = -4; $dy <= 4; $dy++) {
            for ($dx = -4; $dx <= 4; $dx++) {
                $xx = $x + $dx; $yy = $y + $dy;
                if ($xx < 0 || $yy < 0 || $xx >= $this->size || $yy >= $this->size) continue;
                $dist = max(abs($dx), abs($dy));
                $this->setFunction($xx, $yy, $dist !== 2 && $dist !== 4);
            }
        }
    }

    private function drawAlignment(int $x, int $y): void
    {
        for ($dy = -2; $dy <= 2; $dy++) {
            for ($dx = -2; $dx <= 2; $dx++) {
                $this->setFunction($x + $dx, $y + $dy, max(abs($dx), abs($dy)) !== 1);
            }
        }
    }

    private function drawFunctions(): void
    {
        for ($i = 0; $i < $this->size; $i++) {
            $this->setFunction(6, $i, $i % 2 === 0);
            $this->setFunction($i, 6, $i % 2 === 0);
        }
        $this->drawFinder(3, 3);
        $this->drawFinder($this->size - 4, 3);
        $this->drawFinder(3, $this->size - 4);
        $positions = self::ALIGNMENT[$this->version];
        foreach ($positions as $i => $x) {
            foreach ($positions as $j => $y) {
                $last = count($positions) - 1;
                if (($i === 0 && $j === 0) || ($i === 0 && $j === $last) || ($i === $last && $j === 0)) continue;
                $this->drawAlignment($x, $y);
            }
        }
        if ($this->version >= 7) {
            $bits = $this->version;
            for ($i = 0; $i < 12; $i++) $bits = ($bits << 1) ^ ((($bits >> 11) & 1) * 0x1F25);
            $bits = ($this->version << 12) | $bits;
            for ($i = 0; $i < 18; $i++) {
                $bit = (($bits >> $i) & 1) !== 0;
                $a = $this->size - 11 + ($i % 3);
                $b = intdiv($i, 3);
                $this->setFunction($a, $b, $bit);
                $this->setFunction($b, $a, $bit);
            }
        }
        $this->drawFormatZero();
    }

    private function drawFormatZero(): void
    {
        $bits = 0;
        for ($i = 0; $i < 10; $i++) $bits = ($bits << 1) ^ ((($bits >> 9) & 1) * 0x537);
        $bits ^= 0x5412;
        for ($i = 0; $i <= 5; $i++) $this->setFunction(8, $i, (($bits >> $i) & 1) !== 0);
        $this->setFunction(8, 7, (($bits >> 6) & 1) !== 0);
        $this->setFunction(8, 8, (($bits >> 7) & 1) !== 0);
        $this->setFunction(7, 8, (($bits >> 8) & 1) !== 0);
        for ($i = 9; $i < 15; $i++) $this->setFunction(14 - $i, 8, (($bits >> $i) & 1) !== 0);
        for ($i = 0; $i < 8; $i++) $this->setFunction($this->size - 1 - $i, 8, (($bits >> $i) & 1) !== 0);
        for ($i = 8; $i < 15; $i++) $this->setFunction(8, $this->size - 15 + $i, (($bits >> $i) & 1) !== 0);
        $this->setFunction(8, $this->size - 8, true);
    }

    private function drawCodewords(array $codewords): void
    {
        $bitIndex = 0;
        $totalBits = count($codewords) * 8;
        for ($right = $this->size - 1; $right >= 1; $right -= 2) {
            if ($right === 6) $right = 5;
            for ($vertical = 0; $vertical < $this->size; $vertical++) {
                $y = ((($right + 1) & 2) === 0) ? ($this->size - 1 - $vertical) : $vertical;
                for ($j = 0; $j < 2; $j++) {
                    $x = $right - $j;
                    if (!$this->function[$y][$x] && $bitIndex < $totalBits) {
                        $this->modules[$y][$x] = ((($codewords[intdiv($bitIndex, 8)] >> (7 - $bitIndex % 8)) & 1) !== 0);
                        $bitIndex++;
                    }
                }
            }
        }
        if ($bitIndex !== $totalBits) throw new LogicException('QR module capacity mismatch.');
    }

    private function applyMaskZero(): void
    {
        for ($y = 0; $y < $this->size; $y++) {
            for ($x = 0; $x < $this->size; $x++) {
                if (!$this->function[$y][$x] && ($x + $y) % 2 === 0) $this->modules[$y][$x] = !$this->modules[$y][$x];
            }
        }
    }

    private function toPng(int $scale): string
    {
        $width = ($this->size + 8) * $scale;
        $pixels = '';
        for ($my = -4; $my < $this->size + 4; $my++) {
            $row = '';
            for ($mx = -4; $mx < $this->size + 4; $mx++) {
                $black = $mx >= 0 && $mx < $this->size && $my >= 0 && $my < $this->size && $this->modules[$my][$mx];
                $row .= str_repeat($black ? "\x00" : "\xFF", $scale);
            }
            for ($y = 0; $y < $scale; $y++) $pixels .= "\x00" . $row;
        }
        $ihdr = pack('NNCCCCC', $width, $width, 8, 0, 0, 0, 0);
        $png = "\x89PNG\r\n\x1A\n";
        foreach ([['IHDR', $ihdr], ['IDAT', gzcompress($pixels, 9)], ['IEND', '']] as [$type, $data]) {
            $png .= pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
        }
        return $png;
    }
}
