use crate::model::*;
use rusqlite::{params, Connection};
use std::path::Path;

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let db = Connection::open(path)?;
    db.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
         CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, data TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS overrides (id TEXT PRIMARY KEY, data TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY, count INTEGER NOT NULL, last INTEGER NOT NULL);
         PRAGMA user_version=1;"
    )?;
    Ok(db)
}

pub fn read_settings(db: &Connection) -> Result<Settings, Box<dyn std::error::Error>> {
    let raw = db.query_row("SELECT value FROM meta WHERE key='settings'", [], |r| {
        r.get::<_, String>(0)
    });
    match raw {
        Ok(json) => {
            let settings: Settings = serde_json::from_str(&json)?;
            settings.validate().map_err(std::io::Error::other)?;
            Ok(settings)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Settings::default()),
        Err(e) => Err(e.into()),
    }
}

pub fn save_settings(db: &Connection, settings: &Settings) -> Result<(), String> {
    db.execute(
        "INSERT OR REPLACE INTO meta (key,value) VALUES ('settings',?1)",
        [serde_json::to_string(settings).map_err(|e| e.to_string())?],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_apps(db: &Connection) -> Result<Vec<Application>, Box<dyn std::error::Error>> {
    let mut stmt = db.prepare(
        "SELECT a.data, o.data, COALESCE(u.count,0), COALESCE(u.last,0)
        FROM applications a LEFT JOIN overrides o ON a.id=o.id LEFT JOIN usage u ON a.id=u.id",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, Option<String>>(1)?,
            r.get::<_, u64>(2)?,
            r.get::<_, u64>(3)?,
        ))
    })?;
    let mut apps = Vec::new();
    for row in rows {
        let (raw, override_raw, count, last) = row?;
        let mut app: Application = serde_json::from_str(&raw)?;
        if let Some(raw) = override_raw {
            let custom: AppOverride = serde_json::from_str(&raw)?;
            apply_override(&mut app, &custom);
        }
        app.launch_count = count;
        app.last_launched = last;
        crate::catalog::prepare_search(&mut app);
        apps.push(app);
    }
    crate::catalog::sort_library(&mut apps);
    Ok(apps)
}

pub fn apply_override(app: &mut Application, value: &AppOverride) {
    app.name = if value.name.trim().is_empty() {
        app.original_name.clone()
    } else {
        value.name.trim().into()
    };
    app.alias = value.alias.trim().into();
    app.category = value.category.clone();
    app.pinned = value.pinned;
    app.hidden = value.hidden;
    app.filtered = value.filtered;
    app.order = value.order;
}

pub fn save_apps(db: &mut Connection, apps: &[Application]) -> Result<(), String> {
    let tx = db.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare("INSERT OR REPLACE INTO applications (id,data) VALUES (?1,?2)")
            .map_err(|e| e.to_string())?;
        for app in apps {
            stmt.execute(params![
                app.id,
                serde_json::to_string(app).map_err(|e| e.to_string())?
            ])
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

pub fn save_override(db: &Connection, value: &AppOverride) -> Result<(), String> {
    db.execute(
        "INSERT OR REPLACE INTO overrides (id,data) VALUES (?1,?2)",
        params![
            value.id,
            serde_json::to_string(value).map_err(|e| e.to_string())?
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn overrides(db: &Connection) -> Result<Vec<AppOverride>, String> {
    let mut stmt = db
        .prepare("SELECT data FROM overrides")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.map(|row| {
        serde_json::from_str(&row.map_err(|e| e.to_string())?).map_err(|e| e.to_string())
    })
    .collect()
}
