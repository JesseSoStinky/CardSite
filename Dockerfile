# 1) Use Node.js 18 (Debian-based, easier than Alpine for beginners)
FROM node:18

# 2) Set working directory
WORKDIR /app

# 3) Install pnpm globally
RUN npm install -g pnpm

# 4) Copy package files
COPY package.json pnpm-lock.yaml* ./

# 5) Install dependencies
RUN pnpm install --no-frozen-lockfile

# 6) Copy rest of the app (including prisma folder)
COPY . .

# 6b) Generate Prisma client
RUN pnpm prisma generate

# 7) Build Next.js app
RUN pnpm build
# 8) Expose port
EXPOSE 3000

# 9) Start the app
CMD ["pnpm", "start"]

