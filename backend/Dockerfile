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
# curl is for the healthcheck below — the JRE image ships no HTTP client
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/medcode-api-*.jar app.jar
# Render injects PORT; application.yml reads it (default 8001)
# Swagger UI is dev-only: off in every container unless explicitly re-enabled
ENV SWAGGER_ENABLED=false
# POST /api/demo/reset is a public bulk write — off in every container too
ENV DEMO_TOOLS_ENABLED=false
# /api/healthz is the liveness endpoint; a 200 here means the app is serving.
# start-period covers JVM boot + SchemaBootstrap's DDL on a cold database.
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT:-8001}/api/healthz" || exit 1
# Unprivileged at runtime: the app only reads its own jar and talks TCP.
USER 1000:1000
CMD ["java", "-jar", "app.jar"]
