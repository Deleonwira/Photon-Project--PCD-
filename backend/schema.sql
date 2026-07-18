-- ================================================================
-- PHOTON — Database Schema
-- Run this in phpMyAdmin or via: mysql -u root < schema.sql
-- ================================================================

CREATE DATABASE IF NOT EXISTS photon_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE photon_db;

-- ── Users ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  password_hash VARCHAR(128) NOT NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── Projects ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT          NOT NULL,
  name           VARCHAR(128) NOT NULL,
  width          INT          DEFAULT 1920,
  height         INT          DEFAULT 1080,
  background     VARCHAR(32)  DEFAULT '#FFFFFF',
  thumbnail_b64  LONGTEXT,
  image_data     LONGBLOB,
  raw_image_src  LONGTEXT,
  image_transform LONGTEXT,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
