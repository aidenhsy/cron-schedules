# -------- build stage --------
  FROM node:22.12.0-alpine AS builder

  WORKDIR /app
  
  # 1️⃣ Copy only the files that affect your deps
  COPY package*.json ./
  # (or COPY pnpm-lock.yaml ./  etc.)
  
  # 2️⃣ Install once; this layer is cached unless the files above change
  RUN npm ci 
  
  # 3️⃣ Copy the bits that can change frequently
  COPY . .
  
  # 4️⃣ Generate Prisma client & compile your app
  RUN npx prisma generate --schema=prisma/scmorder.prisma && \
    npx prisma generate --schema=prisma/scmbasic.prisma && \
    npx prisma generate --schema=prisma/procurement.prisma && \
    npm run build
  # (If schema.prisma changes often, copy it before step 2 to cache Prisma as well.)
  
  # -------- runtime stage (smaller image) --------
  FROM node:22.12.0-alpine
  WORKDIR /app
  
  # Copy the built app and production deps only
  COPY --from=builder /app .
  
  EXPOSE 3030
  CMD ["npm", "start"]
  