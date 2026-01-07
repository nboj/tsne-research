{
  description = "A basic flake with a shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  inputs.systems.url = "github:nix-systems/default";
  inputs.flake-utils = {
    url = "github:numtide/flake-utils";
    inputs.systems.follows = "systems";
  };

  outputs = { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlay = (final: prev: rec {
          pythonldlibpath = final.lib.makeLibraryPath (with prev; [
            zlib zstd stdenv.cc.cc curl openssl attr libssh bzip2 libxml2
            acl libsodium util-linux xz systemd
          ]);

          python = prev.stdenv.mkDerivation {
            name = "python";
            buildInputs = [ prev.makeWrapper ];
            src = prev.python311;
            installPhase = ''
              mkdir -p $out/bin
              cp -r $src/* $out/
              wrapProgram $out/bin/python3 --set LD_LIBRARY_PATH ${pythonldlibpath}
              wrapProgram $out/bin/python3.11 --set LD_LIBRARY_PATH ${pythonldlibpath}
            '';
          };

          poetry = prev.stdenv.mkDerivation {
            name = "poetry";
            buildInputs = [ prev.makeWrapper ];
            src = prev.poetry;
            installPhase = ''
              mkdir -p $out/bin
              cp -r $src/* $out/
              wrapProgram $out/bin/poetry --set LD_LIBRARY_PATH ${pythonldlibpath}
            '';
          };
        });

        pkgs = import nixpkgs {
          inherit system;
          overlays = [ overlay ];
        };
      in {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.bashInteractive
            pkgs.python
            pkgs.poetry
          ];
        };
      });
}
