import React from "react";
import {Composition, Folder, type CalculateMetadataFunction} from "remotion";
import type {ZodType} from "zod";
import {ComponentScene} from "./components";
import {componentRegistry} from "./registry/componentRegistry";
import {getComponentManifest} from "./registry/componentRegistry";
import type {ComponentConfig} from "./schemas/components";
import {scene001Examples} from "./configs/examples/scene001Examples";
import {editorialOverlayExamples} from "./configs/examples/editorialOverlayExamples";
import {h3TutorialConfigs} from "./configs/works/h3Tutorial";

const RegisteredScene: React.FC<ComponentConfig> = (props) => (
  <ComponentScene config={props} />
);

const calculateMetadata: CalculateMetadataFunction<ComponentConfig> = ({
  props,
}) => ({
  durationInFrames: props.durationInFrames,
  defaultOutName: `${props.component}-${props.mode}`,
});

export const Root: React.FC = () => {
  return (
    <>
      <Folder name="Voice2Motion-Components">
        {componentRegistry.map((manifest) => (
          <Composition
            key={manifest.id}
            id={manifest.id}
            component={RegisteredScene}
            durationInFrames={manifest.defaultProps.durationInFrames}
            fps={30}
            width={1920}
            height={1080}
            schema={manifest.schema as ZodType<ComponentConfig>}
            defaultProps={manifest.defaultProps}
            calculateMetadata={calculateMetadata}
          />
        ))}
      </Folder>
      <Folder name="Demo-Acceptance">
        {Object.entries(scene001Examples).map(([sceneId, config]) => {
          const manifest = getComponentManifest(config.component);
          return (
            <Composition
              key={sceneId}
              id={`Demo-${sceneId}`}
              component={RegisteredScene}
              durationInFrames={config.durationInFrames}
              fps={30}
              width={1920}
              height={1080}
              schema={manifest.schema as ZodType<ComponentConfig>}
              defaultProps={config}
              calculateMetadata={calculateMetadata}
            />
          );
        })}
      </Folder>
      <Folder name="Demo-Editorial-Overlay">
        {Object.entries(editorialOverlayExamples).map(([sceneId, config]) => {
          const manifest = getComponentManifest(config.component);
          return (
            <Composition
              key={sceneId}
              id={`Editorial-${sceneId}`}
              component={RegisteredScene}
              durationInFrames={config.durationInFrames}
              fps={30}
              width={1920}
              height={1080}
              schema={manifest.schema as ZodType<ComponentConfig>}
              defaultProps={config}
              calculateMetadata={calculateMetadata}
            />
          );
        })}
      </Folder>
      <Folder name="Work-015-H3-Tutorial">
        {Object.entries(h3TutorialConfigs).map(([sceneId, config]) => {
          const manifest = getComponentManifest(config.component);
          return (
            <Composition
              key={sceneId}
              id={`H3-${sceneId}`}
              component={RegisteredScene}
              durationInFrames={config.durationInFrames}
              fps={30}
              width={1920}
              height={1080}
              schema={manifest.schema as ZodType<ComponentConfig>}
              defaultProps={config}
              calculateMetadata={calculateMetadata}
            />
          );
        })}
      </Folder>
    </>
  );
};
