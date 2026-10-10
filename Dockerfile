# create a nexjs dockerfile template
FROM node:22-alpine

WORKDIR /app

COPY . .

RUN npm install -g pnpm@9.15.9
RUN pnpm install --frozen-lockfile

RUN pnpm build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["pnpm", "start"]
