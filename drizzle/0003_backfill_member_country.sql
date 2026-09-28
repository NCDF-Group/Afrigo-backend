UPDATE "users" AS "u"
SET "country" = (
  SELECT "o"."country" FROM "organisation_members" AS "m"
  JOIN "organisations" AS "o" ON "o"."id" = "m"."organisation_id"
  WHERE "m"."user_id" = "u"."id"
  ORDER BY "m"."created_at"
  LIMIT 1
)
WHERE "u"."country" IS NULL
  AND "u"."staff_role" IS NULL
  AND EXISTS (SELECT 1 FROM "organisation_members" AS "x" WHERE "x"."user_id" = "u"."id");
