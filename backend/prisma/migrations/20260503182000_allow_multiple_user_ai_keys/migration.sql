CREATE INDEX `user_ai_keys_user_id_status_updated_at_idx`
  ON `user_ai_keys`(`user_id`, `status`, `updated_at`);

DROP INDEX `user_ai_keys_user_id_key` ON `user_ai_keys`;
