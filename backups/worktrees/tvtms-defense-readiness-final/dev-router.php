<?php
$baseDir = __DIR__;
$host = '127.0.0.1';
$port = 8000;

$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($uri, PHP_URL_PATH) ?: '/';

if ($path === '/' || $path === '') {
    http_response_code(200);
    echo 'TVTMS PHP API is running on port 8000.';
    exit;
}

if (str_starts_with($path, '/api')) {
    $_SERVER['SCRIPT_FILENAME'] = $baseDir . '/api/index.php';
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    $_SERVER['PHP_SELF'] = '/api/index.php';
    require $baseDir . '/api/index.php';
    exit;
}

if (str_starts_with($path, '/uploads/')) {
    $file = $baseDir . $path;
    if (is_file($file)) {
        $mime = mime_content_type($file) ?: 'application/octet-stream';
        header('Content-Type: ' . $mime);
        readfile($file);
        exit;
    }
    http_response_code(404);
    echo 'Upload not found';
    exit;
}

http_response_code(404);
echo 'Not found';
