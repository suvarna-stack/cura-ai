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
# curl is what the HEALTHCHECK below runs — the JRE image ships no HTTP client,
# so without this the check fails forever and the container never reports healthy.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/imed-mock-api-*.jar app.jar
# Actuator's readiness group includes the DB check, so an unreachable Postgres
# marks the container unhealthy instead of merely failing every request.
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT:-8003}/actuator/health/readiness" || exit 1
# application.yml reads PORT (default 8003)
# Unprivileged at runtime: the app only reads its own jar and talks TCP.
USER 1000:1000
CMD ["java", "-jar", "app.jar"]
