# -------- build stage --------
  FROM node:22.12.0-alpine AS builder

  WORKDIR /app
  
  # 1️⃣ Copy only package files for dependency install
  COPY package*.json ./
  
  # 2️⃣ Install deps (cached unless package.json changes)
  RUN npm install
  
  # 3️⃣ Copy the rest of the code
  COPY . .
  
  # 4️⃣ Generate Prisma clients
  RUN npx prisma generate --schema=prisma/scmorder.prisma && \
      npx prisma generate --schema=prisma/imbasic.prisma && \
      npx prisma generate --schema=prisma/scmbasic.prisma && \
      npx prisma generate --schema=prisma/procurement.prisma && \
      npx prisma generate --schema=prisma/scmpricing.prisma && \
      npx prisma generate --schema=prisma/inventory.prisma && \
      npm run dev:all
  
  # 5️⃣ Build app
  RUN npm run build
  
  EXPOSE 3030
  CMD ["npm", "start"]