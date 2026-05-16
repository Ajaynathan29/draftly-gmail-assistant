# Use Node.js version 18
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your backend code
COPY . .

# Expose your server port
EXPOSE 3000

# Start the server
CMD ["node", "index.js"]