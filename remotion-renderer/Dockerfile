FROM oven/bun:latest

# Install ffmpeg and Chrome dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    chromium-browser \
    libxss1 \
    libappindicator1 \
    libindicator7 \
    fonts-liberation \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json* ./
RUN bun install

COPY . .

EXPOSE 8080

CMD ["bun", "run", "index.tsx"]
