# -------- build stage --------
  FROM node:22.12.0-alpine AS builder

  WORKDIR /app
  
  # 1️⃣ Copy only package files for dependency install
  COPY package*.json ./
  
  # 2️⃣ Install deps (cached unless package.json changes)
  RUN npm install
  
  # 3️⃣ Copy the rest of the code
  COPY . .
  
  # 5️⃣ Build app
  RUN npm run build
  
  EXPOSE 3038
  CMD ["npm", "start"]