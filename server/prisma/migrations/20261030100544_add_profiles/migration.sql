-- CreateEnum
CREATE TYPE "fitness_goal" AS ENUM ('LOSE_WEIGHT', 'BUILD_MUSCLE', 'STAY_ACTIVE', 'IMPROVE_ENDURANCE');

-- CreateEnum
CREATE TYPE "unit_system" AS ENUM ('METRIC', 'IMPERIAL');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "height_cm" INTEGER,
    "weight_kg" DOUBLE PRECISION,
    "birth_date" DATE,
    "goal" "fitness_goal",
    "units" "unit_system" NOT NULL DEFAULT 'METRIC',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
