# -------- build stage --------
  FROM node:22.12.0-alpine AS builder

  WORKDIR /app
  
  # 1️⃣ Copy only files that affect deps
  COPY package*.json ./
  
  # 2️⃣ Install production deps
  RUN npm install
  
  # 3️⃣ Copy Prisma files and .env (required for schema generation)
  COPY .env .env
  COPY prisma prisma
  
  # 4️⃣ Generate Prisma clients
  RUN mkdir -p generated/scmorder generated/scmbasic generated/procurement generated/scmpricing generated/iminventory && \
      npx prisma generate --schema=prisma/scmorder.prisma && \
      npx prisma generate --schema=prisma/scmbasic.prisma && \
      npx prisma generate --schema=prisma/procurement.prisma && \
      npx prisma generate --schema=prisma/scmpricing.prisma && \
      npx prisma generate --schema=prisma/iminventory.prisma
  
  # 5️⃣ Copy remaining app code and build
  COPY . .
  RUN ls -R /app/generated
  RUN npm run build
  
  # -------- runtime stage --------
  FROM node:22.12.0-alpine
  
  WORKDIR /app
  
  # Copy built app from builder
  COPY --from=builder /app .
  
  EXPOSE 3030
  CMD ["npm", "start"]