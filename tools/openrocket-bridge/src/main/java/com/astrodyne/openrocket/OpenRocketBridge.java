package com.astrodyne.openrocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import info.openrocket.core.document.Simulation;
import info.openrocket.core.motor.Manufacturer;
import info.openrocket.core.motor.Motor;
import info.openrocket.core.motor.MotorConfiguration;
import info.openrocket.core.motor.ThrustCurveMotor;
import info.openrocket.core.rocketcomponent.AxialStage;
import info.openrocket.core.rocketcomponent.BodyTube;
import info.openrocket.core.rocketcomponent.FlightConfigurationId;
import info.openrocket.core.rocketcomponent.InnerTube;
import info.openrocket.core.rocketcomponent.LaunchLug;
import info.openrocket.core.rocketcomponent.NoseCone;
import info.openrocket.core.rocketcomponent.Rocket;
import info.openrocket.core.rocketcomponent.Transition;
import info.openrocket.core.rocketcomponent.TrapezoidFinSet;
import info.openrocket.core.rocketcomponent.position.AxialMethod;
import info.openrocket.core.simulation.FlightData;
import info.openrocket.core.simulation.FlightDataBranch;
import info.openrocket.core.simulation.FlightDataType;
import info.openrocket.core.startup.OpenRocketCore;
import info.openrocket.core.util.Coordinate;

import java.util.List;

public final class OpenRocketBridge {
    private static final ObjectMapper JSON = new ObjectMapper();

    private OpenRocketBridge() {}

    public static void main(String[] args) {
        try {
            System.setProperty("openrocket.bypass.presets", "true");
            System.setProperty("openrocket.bypass.motors", "true");
            System.setProperty("openrocket.locale", "en_US");
            JsonNode request = JSON.readTree(System.in);
            ObjectNode response = simulate(request);
            System.out.println("ASTRODYNE_RESULT:" + JSON.writeValueAsString(response));
        } catch (Throwable error) {
            ObjectNode response = JSON.createObjectNode();
            response.put("ok", false);
            response.put("error", error.getClass().getSimpleName() + ": " + error.getMessage());
            System.out.println("ASTRODYNE_RESULT:" + response);
            error.printStackTrace(System.err);
            System.exit(1);
        }
    }

    private static ObjectNode simulate(JsonNode request) throws Exception {
        OpenRocketCore.initialize();
        JsonNode nose = required(request, "noseCone");
        JsonNode body = required(request, "bodyTube");
        JsonNode fins = required(request, "finSet");

        double noseLength = positive(nose, "lengthM");
        double bodyLength = positive(body, "lengthM");
        double diameter = positive(body, "outerDiameterM");
        double radius = diameter / 2;
        double innerDiameter = positive(body, "innerDiameterM");
        double motorMass = positive(request, "motorMassKg");
        double propellantMass = positive(request, "propellantMassKg");
        double thrust = positive(request, "motorThrustN");
        double burnTime = positive(request, "motorBurnTimeSec");
        if (propellantMass >= motorMass) throw new IllegalArgumentException("propellantMassKg must be less than motorMassKg");

        FlightConfigurationId configurationId = new FlightConfigurationId();
        Rocket rocket = new Rocket();
        rocket.setName(request.path("name").asText("Astrodyne OpenRocket Vehicle"));
        rocket.createFlightConfiguration(configurationId);
        AxialStage stage = new AxialStage();
        stage.setName("Sustainer");
        rocket.addChild(stage);

        NoseCone noseCone = new NoseCone(shape(nose.path("shape").asText("ogive")), noseLength, radius);
        noseCone.setName("Nose Cone");
        noseCone.setThickness(Math.max(0.0005, (diameter - innerDiameter) / 2));
        overrideMass(noseCone, positive(nose, "massKg"));
        stage.addChild(noseCone);

        BodyTube bodyTube = new BodyTube(bodyLength, radius, Math.max(0.00025, (diameter - innerDiameter) / 2));
        bodyTube.setName("Airframe");
        overrideMass(bodyTube, positive(body, "massKg"));
        stage.addChild(bodyTube);

        TrapezoidFinSet finSet = new TrapezoidFinSet(
                fins.path("numFins").asInt(4),
                positive(fins, "rootChordM"),
                positive(fins, "tipChordM"),
                positive(fins, "sweepLengthM"),
                positive(fins, "spanM"));
        finSet.setName("Trapezoidal Fin Set");
        finSet.setThickness(Math.max(0.001, diameter * 0.04));
        finSet.setAxialMethod(AxialMethod.TOP);
        finSet.setAxialOffset(Math.max(0, positive(fins, "positionFromNoseM") - noseLength));
        overrideMass(finSet, positive(fins, "massKg"));
        bodyTube.addChild(finSet);

        LaunchLug launchLug = new LaunchLug();
        launchLug.setName("Launch Lug");
        launchLug.setLength(Math.min(0.08, bodyLength * 0.15));
        launchLug.setOuterRadius(Math.max(0.0025, diameter * 0.04));
        launchLug.setInnerRadius(Math.max(0.002, diameter * 0.032));
        launchLug.setAxialMethod(AxialMethod.TOP);
        launchLug.setAxialOffset(bodyLength * 0.45);
        bodyTube.addChild(launchLug);

        double motorDiameter = Math.max(0.013, Math.min(0.075, diameter * 0.5));
        double motorLength = Math.max(0.07, Math.min(bodyLength * 0.5, motorDiameter * 8));
        InnerTube mount = new InnerTube();
        mount.setName("Motor Mount");
        mount.setLength(motorLength);
        mount.setOuterRadius(motorDiameter / 2 + 0.001);
        mount.setThickness(0.0008);
        mount.setMotorMount(true);
        mount.setAxialMethod(AxialMethod.TOP);
        mount.setAxialOffset(clamp(positive(request, "motorPositionFromNoseM") - noseLength - motorLength / 2, 0, Math.max(0, bodyLength - motorLength)));
        bodyTube.addChild(mount);

        ThrustCurveMotor motor = makeMotor(thrust, burnTime, motorMass, propellantMass, motorDiameter, motorLength);
        MotorConfiguration motorConfiguration = new MotorConfiguration(mount, configurationId);
        motorConfiguration.setMotor(motor);
        motorConfiguration.setEjectionDelay(Motor.PLUGGED_DELAY);
        mount.setMotorConfig(motorConfiguration, configurationId);

        rocket.setSelectedConfiguration(configurationId);
        rocket.getSelectedConfiguration().setAllStages();
        rocket.enableEvents();

        Simulation simulation = new Simulation(rocket);
        simulation.setName("Astrodyne OpenRocket Core Validation");
        simulation.setFlightConfigurationId(configurationId);
        simulation.getOptions().setISAAtmosphere(true);
        simulation.getOptions().setTimeStep(0.02);
        simulation.getOptions().setLaunchRodLength(1.0);
        simulation.getOptions().getAverageWindModel().setAverage(0.0);
        simulation.simulate();

        FlightData data = simulation.getSimulatedData();
        FlightDataBranch branch = data.getBranch(0);
        List<Double> times = branch.get(FlightDataType.TYPE_TIME);
        List<Double> altitudes = branch.get(FlightDataType.TYPE_ALTITUDE);
        List<Double> velocities = branch.get(FlightDataType.TYPE_VELOCITY_TOTAL);
        if (times == null || altitudes == null || velocities == null || times.isEmpty()) {
            throw new IllegalStateException("OpenRocket returned no trajectory samples");
        }

        int apogeeIndex = 0;
        for (int i = 1; i < altitudes.size(); i++) if (altitudes.get(i) > altitudes.get(apogeeIndex)) apogeeIndex = i;
        ObjectNode response = JSON.createObjectNode();
        response.put("ok", true);
        response.put("backend", "OpenRocket Core");
        response.put("version", "24.12");
        response.put("apogeeAltitudeM", data.getMaxAltitude());
        response.put("timeToApogeeSec", times.get(apogeeIndex));
        response.put("maxVelocityMs", data.getMaxVelocity());
        response.put("flightTimeSec", data.getFlightTime());
        response.put("samples", times.size());
        response.put("warnings", simulation.getSimulatedWarnings().size());
        ArrayNode trajectory = response.putArray("trajectory");
        int stride = Math.max(1, times.size() / 800);
        for (int i = 0; i < times.size(); i += stride) {
            ObjectNode point = trajectory.addObject();
            point.put("timeSec", times.get(i));
            point.put("altitudeM", altitudes.get(i));
            point.put("velocityMs", velocities.get(i));
        }
        return response;
    }

    private static ThrustCurveMotor makeMotor(double thrust, double burnTime, double initialMass, double propellantMass, double diameter, double length) {
        double finalMass = initialMass - propellantMass;
        double[] time = {0, burnTime * 0.01, burnTime * 0.99, burnTime};
        double[] force = {0, thrust, thrust, 0};
        Coordinate[] cg = {
                new Coordinate(length / 2, 0, 0, initialMass),
                new Coordinate(length / 2, 0, 0, initialMass - propellantMass * 0.01),
                new Coordinate(length / 2, 0, 0, finalMass + propellantMass * 0.01),
                new Coordinate(length / 2, 0, 0, finalMass)
        };
        return new ThrustCurveMotor.Builder()
                .setManufacturer(Manufacturer.getManufacturer("Astrodyne generated input"))
                .setDesignation("CUSTOM-" + Math.round(thrust))
                .setDescription("Rectangular thrust curve generated from active Astrodyne propulsion inputs")
                .setCaseInfo(String.format("%.1f x %.1f mm", diameter * 1000, length * 1000))
                .setMotorType(Motor.Type.RELOAD)
                .setStandardDelays(new double[] {})
                .setDiameter(diameter)
                .setLength(length)
                .setTimePoints(time)
                .setThrustPoints(force)
                .setCGPoints(cg)
                .setInitialMass(initialMass)
                .setDigest("astrodyne-" + thrust + "-" + burnTime + "-" + initialMass + "-" + propellantMass)
                .build();
    }

    private static Transition.Shape shape(String value) {
        return switch (value.toLowerCase()) {
            case "conical" -> Transition.Shape.CONICAL;
            case "parabolic" -> Transition.Shape.PARABOLIC;
            default -> Transition.Shape.OGIVE;
        };
    }

    private static JsonNode required(JsonNode parent, String field) {
        JsonNode value = parent.get(field);
        if (value == null || !value.isObject()) throw new IllegalArgumentException("Missing object: " + field);
        return value;
    }

    private static double positive(JsonNode parent, String field) {
        double value = parent.path(field).asDouble(Double.NaN);
        if (!Double.isFinite(value) || value <= 0) throw new IllegalArgumentException(field + " must be positive");
        return value;
    }

    private static void overrideMass(info.openrocket.core.rocketcomponent.RocketComponent component, double mass) {
        component.setMassOverridden(true);
        component.setOverrideMass(mass);
    }

    private static double clamp(double value, double minimum, double maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }
}
