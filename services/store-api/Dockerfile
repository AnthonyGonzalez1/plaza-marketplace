# syntax=docker/dockerfile:1

# ---- Build stage: full JDK + Maven wrapper, produces the jar ----
FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace

# Copy only what defines the dependencies first. Docker caches this layer, so dependencies are
# downloaded again only when pom.xml changes, not on every code change.
COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline

COPY src src
# Tests and the format check run in CI (./mvnw verify), not while building the image.
RUN ./mvnw -B -q package -DskipTests

# Split the jar into layers (dependencies, application code, ...) ordered from least to most
# frequently changed, so pushing a new version only uploads the small application layer.
RUN java -Djarmode=tools -jar target/store-api.jar extract --layers --destination extracted

# ---- Runtime stage: JRE only, no compiler, no source code ----
FROM eclipse-temurin:25-jre
WORKDIR /app

# Run as an unprivileged user: a bug in the app must not give root inside the container.
# The user is referenced by its numeric id because Kubernetes can only verify
# "runAsNonRoot" against a number, not against a user name.
RUN groupadd --system --gid 10001 plaza \
    && useradd --system --uid 10001 --gid plaza --no-create-home plaza
USER 10001:10001

COPY --from=build /workspace/extracted/dependencies/ ./
COPY --from=build /workspace/extracted/spring-boot-loader/ ./
COPY --from=build /workspace/extracted/snapshot-dependencies/ ./
COPY --from=build /workspace/extracted/application/ ./

EXPOSE 8080
# Exec form: java is PID 1 and receives SIGTERM directly, which triggers graceful shutdown.
ENTRYPOINT ["java", "-jar", "store-api.jar"]
