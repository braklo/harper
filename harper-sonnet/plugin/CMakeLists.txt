# Sonnet plugin "Harper". Build:
#   cargo build --release            (in harper-sonnet/, makes target/release/libharper_sonnet.a)
#   cmake -S plugin -B build && cmake --build build
# Result: build/sonnet_harper.so -> install into <dir>/kf6/sonnet/ with <dir> in QT_PLUGIN_PATH.
# SPDX-License-Identifier: Apache-2.0
cmake_minimum_required(VERSION 3.20)
project(sonnet_harper LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 REQUIRED COMPONENTS Core)

# No kf6-sonnet-devel needed: the runtime library exports the classes the
# vendored private headers declare.
find_library(SONNET_CORE_LIBRARY NAMES KF6SonnetCore libKF6SonnetCore.so.6 REQUIRED)

set(HARPER_SONNET_LIB "${CMAKE_CURRENT_SOURCE_DIR}/../target/release/libharper_sonnet.a"
    CACHE FILEPATH "Rust static library from cargo build --release")
if(NOT EXISTS "${HARPER_SONNET_LIB}")
    message(FATAL_ERROR "Build the Rust core first: cargo build --release (missing ${HARPER_SONNET_LIB})")
endif()

qt_add_plugin(sonnet_harper SHARED CLASS_NAME HarperClient)
set_target_properties(sonnet_harper PROPERTIES PREFIX "")
target_sources(sonnet_harper PRIVATE harperclient.cpp harperdict.cpp)
target_include_directories(sonnet_harper PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_CURRENT_SOURCE_DIR}/sonnet)
target_link_libraries(sonnet_harper PRIVATE Qt6::Core ${SONNET_CORE_LIBRARY} "${HARPER_SONNET_LIB}" pthread dl m)
# Keep the Rust symbols private to the plugin.
target_link_options(sonnet_harper PRIVATE "LINKER:--exclude-libs,ALL")

# Smoke test that loads the built plugin like Sonnet does (no KDE session needed).
add_executable(plugintest test/plugintest.cpp)
target_include_directories(plugintest PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/sonnet)
target_link_libraries(plugintest PRIVATE Qt6::Core ${SONNET_CORE_LIBRARY})
