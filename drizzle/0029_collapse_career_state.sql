-- Collapse career_state into the career tables themselves (37 -> 36 tables).
--
-- Two separate things lived in career_state:
--   1. a stored version counter (`revision` + `content_hash`) that existed only to
--      invalidate the in-memory assembler cache and to bind an import preview;
--   2. an archive of authored fields with no relational home, plus the verbatim
--      raw source documents.
--
-- The counter becomes a value computed from the data (code side), so it is no
-- longer stored anywhere. The archive moves to where each fact belongs: every
-- career table gains one `extension_json` column holding the authored fields the
-- schema does not model for that row, and the unmodelled document-root values
-- (which belong to the career-level singleton rather than to any record) move to
-- `career_profile.documents_json`. The verbatim raw documents are dropped,
-- because every fact they carried now lives exactly once in the tables above
-- them; only document-level values without a column are carried over.
--
-- Nothing is lost: per-record extras are copied verbatim from
-- career_state.extension_json.records.*, document roots from
-- career_state.legacy_documents_json.

-- 1. One extension column per career table (career_experiences already has one),
--    plus the career-level document roots on the profile singleton.
ALTER TABLE `career_profile` ADD COLUMN `extension_json` text;
--> statement-breakpoint
ALTER TABLE `career_profile` ADD COLUMN `documents_json` text;
--> statement-breakpoint
ALTER TABLE `career_education` ADD COLUMN `extension_json` text;
--> statement-breakpoint
ALTER TABLE `career_achievements` ADD COLUMN `extension_json` text;
--> statement-breakpoint
ALTER TABLE `career_projects` ADD COLUMN `extension_json` text;
--> statement-breakpoint
ALTER TABLE `career_stories` ADD COLUMN `extension_json` text;
--> statement-breakpoint
ALTER TABLE `career_publications` ADD COLUMN `extension_json` text;
--> statement-breakpoint
ALTER TABLE `career_skills` ADD COLUMN `extension_json` text;
--> statement-breakpoint
ALTER TABLE `career_base_resumes` ADD COLUMN `extension_json` text;
--> statement-breakpoint
-- 2. Career-level authored fields that belong to no individual record: the
--    candidate's own extras (preferredName, linkedin, github, portfolio) and the
--    preferences extras the editors already exposed.
UPDATE `career_profile`
SET `extension_json` = json_patch(
  COALESCE(json_extract((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.candidate."$"'), json('{}')),
  COALESCE(json_extract((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.preferences."$"'), json('{}'))
)
WHERE `id` = 1
  AND (
    json_type((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.candidate."$"') = 'object'
    OR json_type((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.preferences."$"') = 'object'
  );
--> statement-breakpoint
-- 3. Document-root values the relational schema does not model, grouped per
--    source document. Anything not listed as modelled content is carried over,
--    including per-document `schemaVersion`/`lastUpdated`.
-- `json_each` must receive a bound value: referencing `career_state` directly in
-- the same FROM clause leaves the argument unbound, so the JSON is sourced
-- through scalar subqueries instead. `json_group_object` treats its second
-- argument as a plain value, so nested objects/arrays have to be marked with
-- `json()` or they would be stored as strings.
UPDATE `career_profile`
SET `documents_json` = (
  SELECT json_group_object(`file`, json(`obj`))
  FROM (
    SELECT
      `doc`.`key` AS `file`,
      json_group_object(
        `entry`.`key`,
        CASE
          WHEN `entry`.`type` IN ('object', 'array') THEN json(`entry`.`value`)
          ELSE `entry`.`value`
        END
      ) AS `obj`
    FROM json_each(
           (SELECT json_extract(`legacy_documents_json`, '$') FROM `career_state` WHERE `id` = 1)
         ) AS `doc`,
         json_each(json_extract(`doc`.`value`, '$')) AS `entry`
    WHERE `entry`.`key` NOT IN (
      'identity', 'education', 'authorization', 'careerBreak', 'truthfulnessRules',
      'directionDefinitions', 'skills', 'achievements', 'experiences', 'publications',
      'projects', 'stories', 'topics'
    )
    GROUP BY `doc`.`key`
  )
)
WHERE `id` = 1
  AND (SELECT `legacy_documents_json` FROM `career_state` WHERE `id` = 1) IS NOT NULL;
--> statement-breakpoint
-- 4. Per-record extras, each copied into the row that owns it.
UPDATE `career_education`
SET `extension_json` = json_extract((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.education.' || json_quote(`career_education`.`stable_key`))
WHERE json_type((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.education.' || json_quote(`career_education`.`stable_key`)) = 'object';
--> statement-breakpoint
UPDATE `career_experiences`
SET `extension_json` = COALESCE(
  `extension_json`,
  json_extract((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.experiences.' || json_quote(`career_experiences`.`stable_key`))
)
WHERE json_type((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.experiences.' || json_quote(`career_experiences`.`stable_key`)) = 'object';
--> statement-breakpoint
UPDATE `career_achievements`
SET `extension_json` = json_extract((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.achievements.' || json_quote(`career_achievements`.`stable_key`))
WHERE json_type((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.achievements.' || json_quote(`career_achievements`.`stable_key`)) = 'object';
--> statement-breakpoint
UPDATE `career_projects`
SET `extension_json` = json_extract((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.projects.' || json_quote(`career_projects`.`stable_key`))
WHERE json_type((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.projects.' || json_quote(`career_projects`.`stable_key`)) = 'object';
--> statement-breakpoint
UPDATE `career_stories`
SET `extension_json` = json_extract((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.stories.' || json_quote(`career_stories`.`stable_key`))
WHERE json_type((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.stories.' || json_quote(`career_stories`.`stable_key`)) = 'object';
--> statement-breakpoint
UPDATE `career_publications`
SET `extension_json` = json_extract((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.publications.' || json_quote(`career_publications`.`stable_key`))
WHERE json_type((SELECT `extension_json` FROM `career_state` WHERE `id` = 1), '$.records.publications.' || json_quote(`career_publications`.`stable_key`)) = 'object';
--> statement-breakpoint
-- Personal skills are keyed by their catalog key rather than their internal id.
UPDATE `career_skills`
SET `extension_json` = json_extract(
  (SELECT `extension_json` FROM `career_state` WHERE `id` = 1),
  '$.records.personalSkills.' || json_quote((SELECT `key` FROM `skills` WHERE `skills`.`id` = `career_skills`.`skill_id`))
)
WHERE json_type(
  (SELECT `extension_json` FROM `career_state` WHERE `id` = 1),
  '$.records.personalSkills.' || json_quote((SELECT `key` FROM `skills` WHERE `skills`.`id` = `career_skills`.`skill_id`))
) = 'object';
--> statement-breakpoint
-- Base Resume versions were keyed `<directionKey>#<version>`.
UPDATE `career_base_resumes`
SET `extension_json` = json_extract(
  (SELECT `extension_json` FROM `career_state` WHERE `id` = 1),
  '$.records.baseResumes.' || json_quote(`career_base_resumes`.`direction_key` || '#' || `career_base_resumes`.`version`)
)
WHERE json_type(
  (SELECT `extension_json` FROM `career_state` WHERE `id` = 1),
  '$.records.baseResumes.' || json_quote(`career_base_resumes`.`direction_key` || '#' || `career_base_resumes`.`version`)
) = 'object';
--> statement-breakpoint
-- 5. The version counter and the verbatim archive are gone: their content now
--    lives in the tables above, and the change probe is computed from the data.
DROP TABLE `career_state`;
