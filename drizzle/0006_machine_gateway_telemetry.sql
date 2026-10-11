CREATE UNIQUE INDEX "machine_telemetry_machine_recorded_unique" ON "machine_telemetry" USING btree ("machine_id","recorded_at");
