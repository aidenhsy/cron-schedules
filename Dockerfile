# -------- build stage --------
  FROM node:22.12.0-alpine AS builder

  WORKDIR /app
  
  # 1️⃣ Copy only files that affect deps
  COPY . .
  
  # 2️⃣ Install production deps
  RUN npm install
  
  # 4️⃣ Generate Prisma clients
  RUN npx prisma generate --schema=prisma/scmorder.prisma && \
      npx prisma generate --schema=prisma/scmbasic.prisma && \
      npx prisma generate --schema=prisma/procurement.prisma && \
      npx prisma generate --schema=prisma/scmpricing.prisma && \
      npx prisma generate --schema=prisma/inventory.prisma
  
  # 5️⃣ Copy remaining app code and build
  RUN npm run build
  
  EXPOSE 3000
  CMD ["npm", "start"]