module.exports = {
  apps: [
    {
      name: "game-library",
      cwd: __dirname,
      script: "npm",
      args: "start -- --hostname 127.0.0.1 --port 3000",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        STORAGE_MODE: "ebs",
        DATABASE_URL: "file:/mnt/game-library-data/game-library.sqlite",
        AWS_REGION: "us-east-1",
        S3_BUCKET: "infs3701-game-library-images",
      },
    },
  ],
};
