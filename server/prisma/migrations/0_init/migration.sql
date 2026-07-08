-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "github_token" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT,
    "repo_url" TEXT,
    "repo_branch" TEXT,
    "last_sync_sha" TEXT,
    "last_audit_at" TIMESTAMP(3),
    "debt_score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFile" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "language" TEXT,
    "line_count" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "job_id" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "incremental" BOOLEAN NOT NULL DEFAULT false,
    "analyzed_file_count" INTEGER NOT NULL DEFAULT 0,
    "reused_file_count" INTEGER NOT NULL DEFAULT 0,
    "overall_score" DOUBLE PRECISION,
    "security_score" DOUBLE PRECISION,
    "performance_score" DOUBLE PRECISION,
    "maintainability_score" DOUBLE PRECISION,
    "debt_score" DOUBLE PRECISION,
    "complexity_score" DOUBLE PRECISION,
    "static_metrics" JSONB,
    "summary" TEXT,
    "total_issues" INTEGER NOT NULL DEFAULT 0,
    "critical_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "file_id" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "suggestion" TEXT,
    "line_number" INTEGER,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFile_project_id_filename_key" ON "ProjectFile"("project_id", "filename");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "ProjectFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

