# Build stage — Maven wrapper needs only a JDK
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN ./mvnw -q dependency:go-offline
COPY src src
# tests need a seeded local Postgres (see README "Testing"), skip in-build
RUN ./mvnw -q -DskipTests package

# Run stage
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/medcode-api-*.jar app.jar
# Render injects PORT; application.yml reads it (default 8001)
CMD ["java", "-jar", "app.jar"]
