# WNY Hosting MySQL Setup

## 1. Import database

1. Open cPanel > phpMyAdmin.
2. Select database `zeljpszw_wny`.
3. Import `hosting/schema.sql`.

## 2. Upload API

Upload the whole `api/` folder to:

```text
public_html/api/
```

Then edit:

```text
public_html/api/config.php
```

Set:

```php
'db_pass' => 'your database password',
'api_key' => 'make-a-long-random-secret-here',
```

Use the same API key in Google Apps Script Script Properties:

```text
WNY_HOSTING_API_URL = https://wnyhq.krukong.site/api
WNY_HOSTING_API_KEY = the same api_key from api/config.php
```

## 3. Deploy Apps Script

After updating `code.gs`, deploy a new Apps Script version/web app.

## 4. Sync data

Open the admin page and run the existing sync/backup action to push Google Sheets data into the hosting MySQL database.
