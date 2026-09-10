Pod::Spec.new do |s|
  s.name           = 'GowayNative'
  s.version        = '1.0.0'
  s.summary        = 'Module natif GOWAY'
  s.homepage       = 'https://goway.app'
  s.license        = 'MIT'
  s.author         = 'GOWAY'
  s.platform       = :ios, '16.2'
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true
  s.source_files   = '**/*.swift'
  s.dependency 'ExpoModulesCore'
  s.dependency 'GowayShared'
  s.frameworks     = 'ActivityKit', 'MapKit', 'CoreLocation'
end
