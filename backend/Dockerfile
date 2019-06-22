FROM node:9.5.0

# Create a /diffy directory that will contain the application's code
RUN mkdir -p /diffy-backend

# Backend dependencies
COPY ./package.json /diffy-backend/
WORKDIR /diffy-backend
RUN npm install

# Build process
COPY . /diffy-backend
RUN npm run-script build

EXPOSE 3000
CMD ["npm", "start"]
