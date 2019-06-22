FROM node:9.5.0

# Create a /diffy directory that will contain the application's code
RUN mkdir -p /diffy-frontend

# Frontend dependencies
RUN npm install -g @angular/cli 
COPY ./package.json /diffy-frontend/
WORKDIR /diffy-frontend
RUN npm install

# Build process
COPY . /diffy-frontend
RUN npm run-script build

EXPOSE 4200
CMD ["npm", "start"]
