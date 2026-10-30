-- Metadata relations only. Media bytes stay in the existing FILES R2 bucket.
CREATE TABLE studio_asset_references (
  project_id TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  PRIMARY KEY(project_id, file_id)
);
CREATE INDEX studio_asset_references_file ON studio_asset_references(file_id);
-- Safe on an existing workspace, including any early Creative JSON records.
INSERT OR IGNORE INTO studio_asset_references(project_id,file_id)
SELECT p.id, f.id FROM studio_projects p, json_tree(json_extract(p.data,'$.creative')) j
JOIN files f ON f.id=j.value WHERE j.type='text';
