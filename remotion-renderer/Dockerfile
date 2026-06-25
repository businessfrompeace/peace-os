FROM oven/bun:latest

# Install ffmpeg and minimal Chrome dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    chromium \
    libxss1 \
    fonts-liberation \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json* ./
RUN bun install

COPY . .

EXPOSE 8080

CMD ["bun", "run", "index.tsx"]
